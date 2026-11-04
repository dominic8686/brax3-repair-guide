"""Fast geometry-only STEP preview export; dimensions are converted mm -> m."""
import json
import struct
import sys
import time
import numpy as np
from OCP.BRep import BRep_Tool
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPControl import STEPControl_Reader
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS

source, destination = sys.argv[1:3]
start = time.monotonic()
reader = STEPControl_Reader()
print('Reading geometry...', flush=True)
assert reader.ReadFile(source) == IFSelect_RetDone
reader.TransferRoots()
shape = reader.OneShape()
print('Meshing geometry...', flush=True)
mesh = BRepMesh_IncrementalMesh(shape, 0.1, False, 0.5, True)
assert mesh.IsDone()
positions, indices = [], []
offset = 0
faces = TopExp_Explorer(shape, TopAbs_FACE)
while faces.More():
    face = TopoDS.Face(faces.Current())
    location = TopLoc_Location()
    tri = BRep_Tool.Triangulation_s(face, location)
    if tri is not None:
        points = []
        for i in range(1, tri.NbNodes() + 1):
            point = tri.Node(i).Transformed(location.Transformation())
            points.append([point.X() / 1000, point.Y() / 1000, point.Z() / 1000])
        triangles = np.array([tri.Triangle(i).Get() for i in range(1, tri.NbTriangles() + 1)], dtype=np.uint32) - 1
        if face.Orientation() == TopAbs_REVERSED:
            triangles = triangles[:, [0, 2, 1]]
        if len(points) and len(triangles):
            positions.append(np.array(points, dtype=np.float32))
            indices.append(triangles + offset)
            offset += len(points)
    faces.Next()
assert positions, 'No geometry generated'
pos = np.concatenate(positions).astype('<f4')
idx = np.concatenate(indices).astype('<u4')
print(f'Writing {len(idx)} triangles...', flush=True)
norm = np.zeros_like(pos)
face_norm = np.cross(pos[idx[:, 1]] - pos[idx[:, 0]], pos[idx[:, 2]] - pos[idx[:, 0]])
for corner in range(3):
    np.add.at(norm, idx[:, corner], face_norm)
lengths = np.linalg.norm(norm, axis=1)
norm /= np.maximum(lengths[:, None], 1e-20)
blobs = [pos.tobytes(), norm.astype('<f4').tobytes(), idx.tobytes()]
views, offset = [], 0
for blob, target in zip(blobs, [34962, 34962, 34963]):
    views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(blob), 'target': target})
    offset += len(blob)
data = b''.join(blobs)
gltf = {
    'asset': {'version': '2.0', 'generator': 'E11 native geometry preview'},
    'scene': 0, 'scenes': [{'nodes': [0]}],
    'nodes': [{'mesh': 0, 'name': 'E11 5G assembly'}],
    'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2, 'material': 0}]}],
    'materials': [{'doubleSided': True, 'pbrMetallicRoughness': {'baseColorFactor': [0.6, 0.65, 0.72, 1], 'metallicFactor': 0.2, 'roughnessFactor': 0.65}}],
    'buffers': [{'byteLength': len(data)}], 'bufferViews': views,
    'accessors': [
        {'bufferView': 0, 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': pos.min(axis=0).tolist(), 'max': pos.max(axis=0).tolist()},
        {'bufferView': 1, 'componentType': 5126, 'count': len(norm), 'type': 'VEC3'},
        {'bufferView': 2, 'componentType': 5125, 'count': idx.size, 'type': 'SCALAR'},
    ],
}
meta = json.dumps(gltf, separators=(',', ':')).encode()
meta += b' ' * (-len(meta) % 4)
with open(destination, 'wb') as output:
    output.write(struct.pack('<III', 0x46546C67, 2, 28 + len(meta) + len(data)))
    output.write(struct.pack('<II', len(meta), 0x4E4F534A))
    output.write(meta)
    output.write(struct.pack('<II', len(data), 0x004E4942))
    output.write(data)
print(json.dumps({'output': destination, 'triangles': len(idx), 'seconds': round(time.monotonic() - start, 1)}), flush=True)
