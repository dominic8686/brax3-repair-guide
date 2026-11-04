import * as THREE from 'three';
import { createScene } from './scene.js';
import { stateBefore } from './guide-steps.js';

const V = (...values) => new THREE.Vector3(...values);
const rounded = (w,h,r) => {
  const s=new THREE.Shape();
  s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);
  s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);
  s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
  return s;
};
export async function createGuideModel(host, steps) {
  const view=createScene(host,()=>{}, {materials:false});
  const parts=await view.load();
  view.renderer.setClearColor(0xe9ebe7,0);view.renderer.toneMappingExposure=.88;
  view.renderer.domElement.setAttribute('aria-label','Interactive Brax3 repair model. Drag to rotate; scroll to zoom.');
  const root=new THREE.Group(); view.scene.add(root);
  const elements={}, originals=new Map();
  const material=(color,metalness=.1,roughness=.55)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const attach=(key,obj,parent=root)=>{parent.add(obj);elements[key]=obj;originals.set(obj,obj.position.clone());return obj;};
  const plate=(w,h,depth,x,y,z,mat,parent=root,r=.002)=>{
    const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(rounded(w,h,r),{depth,bevelEnabled:false,curveSegments:12}),mat);
    mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  };
  const loader=new THREE.TextureLoader();
  const textures=Object.fromEntries(await Promise.all(['battery-label','nfc-markings','brax-logo','lens','lens-2x'].map(async name=>{
    const texture=await loader.loadAsync(`/guide-assets/brax3/${name}.webp`);
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,view.renderer.capabilities.getMaxAnisotropy());return [name,texture];
  })));
  const decal=(map,w,h,x,y,z,parent)=>{
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map,transparent:true,roughness:.7,metalness:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
    mesh.rotation.y=Math.PI;mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  };
  // Retain the real CAD chassis, but don't carry its older cover/flash into this revision.
  for(const part of parts){
    part.mesh.material=material(/FPC|TONGBO/.test(part.cadName)?0x91622d:0x242a2e,.15,.65);
    if([95,98,99,100,101].includes(Number(part.id.slice(5))))part.mesh.visible=false;
  }
  // Reconstructed solids are intentionally identified in the interface; textures
  // below are actual artwork from the supplied Brax3 KeyShot package.
  const battery=plate(.063,.086,.004,0,-.043,-.0076,material(0x0c0e10,0,.8));attach('battery',battery);
  decal(textures['battery-label'],.059,.077,0,0,-.00005,battery);
  const carrier=attach('carrier',new THREE.Group());
  plate(.072,.045,.001,0,.027,-.009,material(0x181d21),carrier,.004);
  plate(.072,.019,.001,0,-.100,-.009,material(0x1a2024),carrier,.003);
  for(const x of [-.0335,.0335])plate(.003,.087,.001,x,-.043,-.0085,material(0x1a2024),carrier,.001);
  // Structural ribs match the design language visible in the supplied render.
  for(let row=0;row<6;row++)for(let col=0;col<5;col++){
    plate(.0058,.0044,.00035,-.027+col*.007,.009+row*.006,-.0095,material(0x292e31,0,.8),carrier,.0004);
  }
  const nfc=plate(.042,.066,.0005,0,-.049,-.010,material(0x080a0c,0,.83),carrier,.006);
  // The rectangular spiral is a visual reconstruction; it is not a coil specification.
  for(let i=0;i<9;i++){
    const points=rounded(.040-i*.0007,.064-i*.0007,.005).getPoints(80).map(p=>V(p.x,p.y,-.00005));
    const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x24282a}));nfc.add(line);
  }
  plate(.005,.032,.0003,.002,.002,-.010,material(0x14181a),carrier,.0004);
  const markings=decal(textures['nfc-markings'],.047,.091,0,-.033,-.0106,carrier); markings.material.alphaMap=textures['nfc-markings']; markings.material.alphaTest=.02;
  decal(textures['brax-logo'],.017,.0055,0,-.052,-.0108,carrier);
  const cameraIsland=plate(.027,.047,.0015,.02075,.0245,-.0108,material(0x101419,.35,.3),carrier,.012);
  for(const [y,name] of [[.036,'lens'],[.013,'lens-2x']]){
    const rim=new THREE.Mesh(new THREE.CylinderGeometry(.0103,.0103,.0015,64),material(0x737b82,.85,.23));rim.rotation.x=Math.PI/2;rim.position.set(.02075,y,-.0123);carrier.add(rim);
    const lens=new THREE.Mesh(new THREE.CircleGeometry(.0095,64),material(0x04070b,.2,.18));lens.rotation.y=Math.PI;lens.position.set(.02075,y,-.0132);carrier.add(lens);
    const optic=new THREE.Mesh(new THREE.CircleGeometry(.0022,48),new THREE.MeshStandardMaterial({map:textures[name],roughness:.18,metalness:.1}));optic.rotation.y=Math.PI;optic.position.set(.02075,y,-.01325);carrier.add(optic);
  }
  const flash=new THREE.Mesh(new THREE.CircleGeometry(.002,48),material(0xecebc9,0,.3));flash.rotation.y=Math.PI;flash.position.set(.012,.025,-.0124);carrier.add(flash);
  const coverShape=rounded(.075,.165,.008);
  const hole=new THREE.Path();hole.absellipse(.02075,.0554,.0145,.026,0,Math.PI*2,true);coverShape.holes.push(hole);
  const cover=new THREE.Mesh(new THREE.ExtrudeGeometry(coverShape,{depth:.0006,bevelEnabled:false,curveSegments:32}),new THREE.MeshPhysicalMaterial({color:0x9caaa8,transparent:true,opacity:.16,roughness:.14,metalness:0,clearcoat:1,clearcoatRoughness:.1,side:THREE.DoubleSide,depthWrite:false}));
  cover.position.set(0,-.0309,-.0114);attach('cover',cover);
  const edgePoints=rounded(.075,.165,.008).getPoints(100).map(p=>V(p.x,p.y,-.0001));
  cover.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(edgePoints),new THREE.LineBasicMaterial({color:0x4c5357})));
  const batteryFlex=plate(.008,.014,.0005,-.015,.006,-.0065,material(0x89632e,.4,.5));attach('batteryFlex',batteryFlex);
  const tabs=attach('tabs',new THREE.Group());
  for(const x of [-.029,.029])plate(.007,.012,.0002,x,-.075,-.008,material(0x807867,0,.8),tabs,.001);
  const screws=attach('screws',new THREE.Group());
  for(const [x,y] of [[-.030,.047],[.030,.047],[-.030,.002],[.030,.002],[-.030,-.096],[.030,-.096]]){
    const head=new THREE.Mesh(new THREE.CylinderGeometry(.0014,.0014,.0006,24),material(0x888e91,.8,.3));head.rotation.x=Math.PI/2;head.position.set(x,y,-.011);screws.add(head);
    for(const angle of [0,Math.PI/2]){const slot=new THREE.Mesh(new THREE.BoxGeometry(.0018,.0003,.0001),material(0x101316));slot.rotation.z=angle;slot.position.set(x,y,-.0114);screws.add(slot);}
  }
  const seam=attach('seam',new THREE.Group());
  const seamGeometry=new THREE.BufferGeometry().setFromPoints(rounded(.073,.163,.007).getPoints(100).map(p=>V(p.x,p.y-.0309,-.0117)));
  seam.add(new THREE.LineLoop(seamGeometry,new THREE.LineBasicMaterial({color:0xe98248})));
  const arrow=new THREE.ArrowHelper(V(0,0,-1),V(0,0,0),.022,0xdf6d36,.005,.0025);view.scene.add(arrow);
  arrow.traverse(o=>{if(o.material){o.material.depthTest=false;o.renderOrder=20;}});
  const tool=new THREE.Group();view.scene.add(tool);
  let current,frame=0,amount=.15,annotations=true;
  const center=key=>key==='phone'?V(0,-.03,-.01):new THREE.Box3().setFromObject(elements[key]).getCenter(V(0,0,0));
  function makeTool(action,toolIds){
    while(tool.children.length){const child=tool.children[0];tool.remove(child);child.geometry?.dispose();child.material?.dispose();}
    const box=(w,h,d,z,color)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color,.3,.45));m.position.z=z;tool.add(m);return m;};
    if(action==='heat'){box(.018,.018,.035,-.065,0xdcb055);box(.012,.028,.012,-.075,0x26383e).position.y=-.018;}
    else if(action==='unscrew'||action==='screw'){box(.0015,.0015,.028,-.014,0xa7b4bc);box(.007,.007,.032,-.044,0x355963);}
    else if(action==='wipe'){box(.025,.025,.001,-.017,0xc5b58e);}
    else if(toolIds.includes(5)||toolIds.includes(6)){box(.004,.001,.025,-.012,0x355963);box(.007,.003,.028,-.037,0x273d43);}
    else if(toolIds.includes(7)){const m=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,.002,32),material(0x617b82));m.rotation.x=Math.PI/2;m.position.z=-.009;tool.add(m);box(.004,.004,.018,-.018,0x314e59);}
  }
  function update(value){
    amount=value;const stage=current.stage,before=stateBefore(current.number,steps);
    for(const [key,obj] of Object.entries(elements)){obj.position.copy(originals.get(obj));obj.rotation.set(0,0,0);obj.visible=before[key]!==1;}
    elements.seam.visible=['wipe','adhesive','pry'].includes(stage.action);
    const obj=elements[stage.target];const inward=['insert','connect','screw'].includes(stage.action);const t=inward?1-value:value;
    if(obj){
      obj.visible=true;
      if(['lift','insert','disconnect','connect','peel','unscrew','screw','pry'].includes(stage.action)){
        obj.position.z-=t*stage.distance;
        if(stage.target==='cover'&&stage.action==='lift')obj.position.x-=t*.025;
        if(stage.target==='carrier')obj.position.x-=t*.012;
      }
    }
    const point=center(stage.target);
    if(stage.target==='screws')point.set(-.030,.047,-.011-t*.014);
    if(stage.action==='pry')point.set(-.037,-.06,-.012-value*.003);
    if(stage.action==='heat')point.set(Math.sin(value*Math.PI*2)*.03,-.03+Math.cos(value*Math.PI*2)*.065,-.012);
    tool.position.copy(point);tool.rotation.set(0,0,['pry','disconnect'].includes(stage.action)?.3:0);tool.visible=stage.tools.length>0;
    arrow.visible=annotations&&stage.action!=='inspect';arrow.position.copy(point).add(V(-.008,0,inward?-.03:.005));arrow.setDirection(V(0,0,inward?1:-1));
    if(stage.action==='heat'){arrow.position.z=point.z-.034;arrow.setDirection(V(0,0,1));}
  }
  function camera(){
    const [roll,elevation,crop]=current.stage.frames[frame],rad=roll*Math.PI/180;
    view.camera.up.set(Math.sin(rad),Math.cos(rad),0);
    const target=crop<.9?center(current.stage.target):V(0,-.031,-.015);
    view.controls.target.copy(target);const distance=.35*crop*Math.max(1,1/view.camera.aspect);
    view.camera.position.copy(target).add(V(.2,Math.sqrt(1-elevation*elevation),-elevation).normalize().multiplyScalar(distance));view.controls.update();
  }
  return {view,parts,setStep(number,stage,frameIndex=0){current={number,stage};frame=frameIndex;makeTool(stage.action,stage.tools);update(.15);camera();},update,camera,setAnnotations(value){annotations=value;},render(){view.render();}};
}
