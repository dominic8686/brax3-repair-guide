"""Export STEP component instances to a compact GLB, without expensive CAD styles."""
import json
import struct
import sys
import time
from pathlib import Path
import numpy as np
from OCP.BRep import BRep_Tool
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ShapeTool
from OCP.collections import Sequence_TDF_Label


def label_name(label):
    attribute = TDataStd_Name()
    return attribute.Get().ToExtString() if label.FindAttribute(TDataStd_Name.GetID_s(), attribute) else ''


def components(label, parent_location, path):
    definition = label
    location = parent_location
    if XCAFDoc_ShapeTool.IsReference_s(label):
        definition = TDF_Label()
        XCAFDoc_ShapeTool.GetReferredShape_s(label, definition)
        location = parent_location.Multiplied(XCAFDoc_ShapeTool.GetLocation_s(label))
    name = label_name(definition) or label_name(label) or 'Unnamed CAD component'
    path = path + [name]
    if XCAFDoc_ShapeTool.IsAssembly_s(definition):
        children = Sequence_TDF_Label()
        XCAFDoc_ShapeTool.GetComponents_s(definition, children)
        for i in range(1, children.Length() + 1):
            yield from components(children.Value(i), location, path)
    else:
        yield name, path, XCAFDoc_ShapeTool.GetShape_s(definition), location


def tessellate(shape, assembly_location):
    mesher = BRepMesh_IncrementalMesh(shape, 0.1, False, 0.5, True)
    if not mesher.IsDone():
        raise RuntimeError('Component meshing failed')
    positions, indices, offset = [], [], 0
    faces = TopExp_Explorer(shape, TopAbs_FACE)
    while faces.More():
        face = TopoDS.Face(faces.Current())
        location = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, location)
        if tri is not None and tri.NbNodes() and tri.NbTriangles():
            transform = assembly_location.Multiplied(location).Transformation()
            points = []
            for i in range(1, tri.NbNodes() + 1):
                p = tri.Node(i).Transformed(transform)
                points.append([p.X() / 1000, p.Y() / 1000, p.Z() / 1000])
            triangles = np.array([tri.Triangle(i).Get() for i in range(1, tri.NbTriangles() + 1)], dtype=np.uint32) - 1
            if face.Orientation() == TopAbs_REVERSED:
                triangles = triangles[:, [0, 2, 1]]
            positions.append(np.array(points, dtype=np.float32))
            indices.append(triangles + offset)
            offset += len(points)
        faces.Next()
    if not positions:
        return None
    pos, idx = np.concatenate(positions), np.concatenate(indices)
    normal = np.zeros_like(pos)
    face_norm = np.cross(pos[idx[:, 1]] - pos[idx[:, 0]], pos[idx[:, 2]] - pos[idx[:, 0]])
    for corner in range(3):
        np.add.at(normal, idx[:, corner], face_norm)
    normal /= np.maximum(np.linalg.norm(normal, axis=1)[:, None], 1e-20)
    return pos, normal, idx


def export(source, destination):
    started = time.monotonic()
    reader = STEPCAFControl_Reader()
    reader.SetNameMode(True)
    for mode in ['Color', 'Layer', 'Props', 'SHUO', 'GDT', 'Mat', 'View', 'Meta', 'ProductMeta']:
        getattr(reader, f'Set{mode}Mode')(False)
    document = TDocStd_Document(TCollection_ExtendedString('BinXCAF'))
    print('Reading STEP component tree...', flush=True)
    if reader.ReadFile(source) != IFSelect_RetDone or not reader.Transfer(document):
        raise RuntimeError('STEP import failed')
    shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(document.Main())
    roots = Sequence_TDF_Label()
    shape_tool.GetFreeShapes(roots)
    parts = []
    for i in range(1, roots.Length() + 1):
        parts.extend(components(roots.Value(i), TopLoc_Location(), []))
    print(f'Extracting {len(parts)} component instances...', flush=True)
    gltf = {'asset': {'version': '2.0', 'generator': 'E11 component exporter'}, 'scene': 0,
            'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'materials': [],
            'buffers': [], 'bufferViews': [], 'accessors': []}
    gltf['materials'].append({'name': 'Neutral CAD', 'doubleSided': True,
        'pbrMetallicRoughness': {'baseColorFactor': [0.55, 0.61, 0.68, 1], 'metallicFactor': 0.15, 'roughnessFactor': 0.55}})
    chunks, byte_offset, manifest, skipped = [], 0, [], []

    def accessor(array, target, kind, component_type, bounds=False):
        nonlocal byte_offset
        blob = array.tobytes()
        chunks.append(blob)
        view_id = len(gltf['bufferViews'])
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': byte_offset, 'byteLength': len(blob), 'target': target})
        byte_offset += len(blob)
        item = {'bufferView': view_id, 'componentType': component_type,
                'count': array.size if kind == 'SCALAR' else len(array), 'type': kind}
        if bounds:
            item.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        gltf['accessors'].append(item)
        return len(gltf['accessors']) - 1

    for i, (name, path, shape, location) in enumerate(parts):
        result = tessellate(shape, location)
        if result is None:
            skipped.append(name)
            continue
        pos, normal, idx = result
        low, high = pos.min(axis=0), pos.max(axis=0)
        center = (low + high) / 2
        local_pos = (pos - center).astype('<f4')
        mesh_id = len(gltf['meshes'])
        info = {'id': f'part-{mesh_id:03d}', 'name': name, 'path': path, 'center': center.tolist(),
                'min': low.tolist(), 'max': high.tolist(), 'triangles': len(idx)}
        primitive = {'attributes': {'POSITION': accessor(local_pos, 34962, 'VEC3', 5126, True),
                                    'NORMAL': accessor(normal.astype('<f4'), 34962, 'VEC3', 5126)},
                     'indices': accessor(idx.astype('<u4'), 34963, 'SCALAR', 5125), 'material': 0}
        gltf['meshes'].append({'name': info['id'], 'primitives': [primitive]})
        gltf['nodes'].append({'mesh': mesh_id, 'name': info['id'], 'translation': center.tolist(), 'extras': info})
        gltf['scenes'][0]['nodes'].append(mesh_id)
        manifest.append(info)
        if (i + 1) % 20 == 0:
            print(f'Processed {i + 1}/{len(parts)} instances', flush=True)
    if not manifest:
        raise RuntimeError('No mesh geometry exported')
    gltf['buffers'].append({'byteLength': byte_offset})
    metadata = json.dumps(gltf, separators=(',', ':')).encode()
    metadata += b' ' * (-len(metadata) % 4)
    with open(destination, 'wb') as output:
        output.write(struct.pack('<III', 0x46546C67, 2, 28 + len(metadata) + byte_offset))
        output.write(struct.pack('<II', len(metadata), 0x4E4F534A))
        output.write(metadata)
        output.write(struct.pack('<II', byte_offset, 0x004E4942))
        for chunk in chunks:
            output.write(chunk)
    summary = {'source': Path(source).name, 'components': manifest, 'skippedWithoutFaces': skipped,
               'triangles': sum(p['triangles'] for p in manifest), 'seconds': round(time.monotonic() - started, 1)}
    Path(destination).with_suffix('.json').write_text(json.dumps(summary, indent=2), encoding='utf8')
    print(json.dumps({k: v for k, v in summary.items() if k != 'components'}), flush=True)
    print(f'Exported {len(manifest)} meshes to {destination}', flush=True)


if __name__ == '__main__':
    export(*sys.argv[1:3])
