import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DAY = 86400;
const MOON_PERIOD = 27.321661 * DAY;
const HUBBLE_PERIOD = 95 * 60;
const WEBB_PERIOD = 168 * DAY;
const ROMAN_PERIOD = 180 * DAY; // renderer placeholder only
const EARTH_RADIUS_KM = 6371;
const HUBBLE_RADIUS_KM = EARTH_RADIUS_KM + 483;
const MOON_RADIUS_KM = 384400;
const L2_KM = 1_500_000;
const KM_PER_UNIT = 100_000;
const HUBBLE_INC = THREE.MathUtils.degToRad(28.5);
const MOON_INC = THREE.MathUtils.degToRad(5.145);

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x03050a, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 600);
camera.position.set(4.5, 6.5, 30);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.target.set(7, 0, 0);
controls.minDistance = 0.08;
controls.maxDistance = 120;

scene.add(new THREE.HemisphereLight(0x8ca6c9, 0x080a10, 1.25));
const sunLight = new THREE.DirectionalLight(0xfff1d0, 4.2);
sunLight.position.set(-20, 5, 2);
scene.add(sunLight);

function stars(count = 1800) {
  const g = new THREE.BufferGeometry();
  const a = new Float32Array(count * 3);
  let seed = 20260830;
  const rnd = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const r = 90 + rnd() * 150;
    const u = rnd() * 2 - 1;
    const p = rnd() * Math.PI * 2;
    const q = Math.sqrt(1 - u * u);
    a[i * 3] = r * q * Math.cos(p);
    a[i * 3 + 1] = r * u;
    a[i * 3 + 2] = r * q * Math.sin(p);
  }
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaebed4, size: .075, transparent: true, opacity: .72 })));
}
stars();

function sphere(radius, color, roughness = .72) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 24), new THREE.MeshStandardMaterial({ color, roughness, metalness: .03 }));
}

const earth = sphere(.72, 0x2e6ca8, .78);
const moon = sphere(.18, 0x9ca4ae, .9);
scene.add(earth, moon);

// atmosphere: restrained rim, not a cartoon glow
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(.745, 40, 24),
  new THREE.MeshBasicMaterial({ color: 0x6fb6e8, transparent: true, opacity: .10, side: THREE.BackSide })
);
earth.add(atmosphere);

const equator = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(Array.from({length:160},(_,i)=>{
    const a=i/160*Math.PI*2; return new THREE.Vector3(Math.cos(a)*.755,0,Math.sin(a)*.755);
  })),
  new THREE.LineBasicMaterial({ color:0x6e8aa6, transparent:true, opacity:.13 })
);
earth.add(equator);

function orbitLine(color, opacity=.35) {
  return new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, transparent:true, opacity }));
}
const moonTrail = orbitLine(0x718096,.16);
const hubbleTrail = orbitLine(0xdcecff,.48);
const webbTrail = orbitLine(0xefb45d,.48);
const romanTrail = orbitLine(0xb88cff,.42);
scene.add(moonTrail,hubbleTrail,webbTrail,romanTrail);

// L2 is a reference, not a celestial body.
const l2 = new THREE.Group();
const l2Mat = new THREE.LineBasicMaterial({ color:0x86a6bd, transparent:true, opacity:.42 });
const l2Cross = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-.18,0,0),new THREE.Vector3(.18,0,0),
  new THREE.Vector3(0,-.18,0),new THREE.Vector3(0,.18,0),
  new THREE.Vector3(0,0,-.18),new THREE.Vector3(0,0,.18)
]);
l2.add(new THREE.LineSegments(l2Cross,l2Mat));
const ringPts=Array.from({length:80},(_,i)=>{const a=i/80*Math.PI*2;return new THREE.Vector3(0,Math.cos(a)*.30,Math.sin(a)*.30)});
l2.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts),l2Mat));
l2.position.x=L2_KM/KM_PER_UNIT;
scene.add(l2);

function spacecraft(url, fallbackColor, scale) {
  const group = new THREE.Group();
  const marker = new THREE.Mesh(new THREE.SphereGeometry(.035,16,10), new THREE.MeshBasicMaterial({color:fallbackColor}));
  group.add(marker);
  const sm = new THREE.SpriteMaterial({ transparent:true, depthWrite:false, alphaTest:.04 });
  const sprite = new THREE.Sprite(sm);
  sprite.scale.set(scale,scale,scale);
  group.add(sprite);
  new THREE.TextureLoader().load(url,t=>{t.colorSpace=THREE.SRGBColorSpace;sm.map=t;sm.needsUpdate=true;marker.visible=false;});
  scene.add(group);
  return {group,sprite,marker};
}
const craft={
  hubble:spacecraft('./public/assets/spacecraft/hubble.png',0xdcecff,.95),
  webb:spacecraft('./public/assets/spacecraft/jwst.png',0xefb45d,1.25),
  roman:spacecraft('./public/assets/spacecraft/roman.png',0xb88cff,1.15),
};

const sim={timeMs:Date.now(),playing:true,rate:DAY,view:'system',readable:true,last:performance.now(),focus:null};

function loopPts(rx,ry,rz,phase=0,n=220){
  const pts=[];
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2+phase;
    pts.push(new THREE.Vector3(L2_KM/KM_PER_UNIT + rx*Math.sin(2*a), ry*Math.cos(a), rz*Math.sin(a)));
  }
  return pts;
}
const webbPts=loopPts(1.9,5.5,4.2,0);
const romanPts=loopPts(1.45,4.6,3.4,1.15);
webbTrail.geometry.setFromPoints(webbPts);
romanTrail.geometry.setFromPoints(romanPts);

function localCircle(radius,inc,n=180){
  const pts=[];
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2;
    const p=new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius);
    p.applyAxisAngle(new THREE.Vector3(1,0,0),inc); pts.push(p);
  }
  return pts;
}

function refreshLocalGeometry(){
  const moonR=(MOON_RADIUS_KM/KM_PER_UNIT)*(sim.readable?1.45:1);
  const hPhysical=HUBBLE_RADIUS_KM/KM_PER_UNIT;
  const hR=sim.readable?1.05:hPhysical;
  moonTrail.geometry.dispose(); moonTrail.geometry=new THREE.BufferGeometry().setFromPoints(localCircle(moonR,MOON_INC));
  hubbleTrail.geometry.dispose(); hubbleTrail.geometry=new THREE.BufferGeometry().setFromPoints(localCircle(hR,HUBBLE_INC));
}
refreshLocalGeometry();

function state(){
  const t=sim.timeMs/1000;
  const moonA=t/MOON_PERIOD*Math.PI*2;
  const moonR=(MOON_RADIUS_KM/KM_PER_UNIT)*(sim.readable?1.45:1);
  moon.position.set(Math.cos(moonA)*moonR,0,Math.sin(moonA)*moonR).applyAxisAngle(new THREE.Vector3(1,0,0),MOON_INC);

  const hA=t/HUBBLE_PERIOD*Math.PI*2;
  const hR=sim.readable?1.05:HUBBLE_RADIUS_KM/KM_PER_UNIT;
  craft.hubble.group.position.set(Math.cos(hA)*hR,0,Math.sin(hA)*hR).applyAxisAngle(new THREE.Vector3(1,0,0),HUBBLE_INC);

  const wA=(t/WEBB_PERIOD*Math.PI*2)%(Math.PI*2);
  craft.webb.group.position.set(
    L2_KM/KM_PER_UNIT+1.9*Math.sin(2*wA),
    5.5*Math.cos(wA),
    4.2*Math.sin(wA)
  );
  const rA=(t/ROMAN_PERIOD*Math.PI*2+1.15)%(Math.PI*2);
  craft.roman.group.position.set(
    L2_KM/KM_PER_UNIT+1.45*Math.sin(2*rA),
    4.6*Math.cos(rA),
    3.4*Math.sin(rA)
  );

  const localVisible=sim.view==='earth'||sim.view==='system'||sim.focus==='hubble';
  moon.visible=localVisible; moonTrail.visible=localVisible&&$('trailToggle').checked;
  hubbleTrail.visible=localVisible&&$('trailToggle').checked;
  webbTrail.visible=$('trailToggle').checked; romanTrail.visible=$('trailToggle').checked;
}

const VIEWS={
  system:{pos:[2.8,7.2,31],target:[7.2,0,0],title:'Earth → Sun–Earth L2',blurb:'One rotating-frame overview: Earth at left, the L2 region roughly 1.5 million km anti-sunward, with Hubble compressed near Earth.'},
  earth:{pos:[3.4,2.4,5.7],target:[0,0,0],title:'Earth / Hubble',blurb:'Hubble circles only a few hundred kilometres above Earth. Readable scale enlarges that separation without changing the underlying reference values.'},
  l2:{pos:[24,10,19],target:[15,0,0],title:'Sun–Earth L2 region',blurb:'Webb and Roman trace large three-dimensional paths around the L2 region. Current curves are explicitly educational placeholders.'},
  free:{pos:null,target:null,title:'Free camera',blurb:'Inspect the Earth–L2 geometry directly. Drag to orbit, pinch or scroll to zoom.'}
};

function setView(name,focus=null){
  sim.view=name; sim.focus=focus;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  const v=VIEWS[name];
  $('viewTitle').textContent=v.title; $('viewBlurb').textContent=v.blurb;
  if(v.pos){camera.position.set(...v.pos);controls.target.set(...v.target);controls.update();}
}

function focusCraft(name){
  sim.focus=name;
  const info={
    hubble:['Hubble Space Telescope','PROPAGATED','Low-Earth orbit · ~483 km altitude · 28.5° inclination · ~95 min period. Current phase is illustrative until TLE/SGP4 is connected.'],
    webb:['James Webb Space Telescope','EDUCATIONAL','Sun–Earth L2 region. The displayed loop is a visual placeholder; authoritative JWST ephemeris will replace it.'],
    roman:['Nancy Grace Roman Space Telescope','EDUCATIONAL','Sun–Earth L2 region. The displayed loop is a visual placeholder while Roman trajectory products are integrated.']
  }[name];
  $('focusName').textContent=info[0]; $('focusMode').textContent=info[1]; $('focusInfo').textContent=info[2]; $('focusCard').hidden=false;
  if(name==='hubble') setView('earth',name); else setView('l2',name);
}

function followTarget(){
  if(!sim.focus)return;
  const p=craft[sim.focus].group.position;
  const dist=sim.focus==='hubble'?2.8:7.5;
  const desired=p.clone().add(new THREE.Vector3(dist*.55,dist*.38,dist));
  camera.position.lerp(desired,.055); controls.target.lerp(p,.085);
}

function resize(){
  const w=innerWidth,h=innerHeight;
  const pr=renderer.getPixelRatio();
  if(canvas.width!==Math.round(w*pr)||canvas.height!==Math.round(h*pr))renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();
}

function tick(now){
  const dt=Math.min(.1,(now-sim.last)/1000);sim.last=now;
  if(sim.playing)sim.timeMs+=dt*sim.rate*1000;
  resize(); state(); followTarget(); controls.update();
  earth.rotation.y+=dt*.018;
  renderer.render(scene,camera);
  $('utcReadout').textContent=new Date(sim.timeMs).toISOString().replace('T',' ').replace('.000Z','Z');
  requestAnimationFrame(tick);
}

$('playBtn').addEventListener('click',()=>{sim.playing=!sim.playing;$('playBtn').textContent=sim.playing?'Pause':'Play';});
$('nowBtn').addEventListener('click',()=>{sim.timeMs=Date.now();});
$('rateSelect').addEventListener('change',e=>{sim.rate=Number(e.target.value)||1;});
$('scaleToggle').addEventListener('change',e=>{sim.readable=e.target.checked;refreshLocalGeometry();});
$('trailToggle').addEventListener('change',()=>state());
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{sim.focus=null;$('focusCard').hidden=true;setView(b.dataset.view);}));
document.querySelectorAll('[data-focus]').forEach(b=>b.addEventListener('click',()=>focusCraft(b.dataset.focus)));
$('closeFocus').addEventListener('click',()=>{sim.focus=null;$('focusCard').hidden=true;});

setView('system');
requestAnimationFrame(tick);
