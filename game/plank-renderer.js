const STARS = Array.from({ length: 85 }, (_, i) => ({
  x: Math.sin(i * 127.1) * .5 + .5,
  y: Math.sin(i * 311.7) * .5 + .5,
  size: i % 5 === 0 ? 1.6 : .8,
}));
const PILOTS = [
  { ship: '#9ceae2', glow: '#83e5de', exhaust: '#419d9c', seam: '#2a6e73' },
  { ship: '#d9c5ff', glow: '#c4a3ff', exhaust: '#8263b5', seam: '#685087' },
];

// Return a source rectangle in video pixels, preserving the destination aspect
// ratio even when a face is near an edge or the input video is not square.
export function calculateFaceCrop(face, videoWidth, videoHeight, targetWidth, targetHeight) {
  const bounds = face?.bounds;
  if (!bounds || ![videoWidth, videoHeight, targetWidth, targetHeight, bounds.width, bounds.height]
    .every(value => Number.isFinite(value) && value > 0)
    || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return null;
  const aspect = targetWidth / targetHeight;
  const faceWidth = bounds.width * videoWidth, faceHeight = bounds.height * videoHeight;
  let width = Math.max(faceWidth * 1.65, faceHeight * 1.65 * aspect);
  let height = width / aspect;
  const fit = Math.min(1, videoWidth / width, videoHeight / height);
  width *= fit; height *= fit;
  const centerX = (bounds.x + bounds.width * .5) * videoWidth;
  const centerY = (bounds.y + bounds.height * .45) * videoHeight;
  return {
    x: Math.max(0, Math.min(videoWidth - width, centerX - width / 2)),
    y: Math.max(0, Math.min(videoHeight - height, centerY - height / 2)),
    width, height,
  };
}

// Small, original pixel sprites. A cell is always a solid square.
const ROCK = ['  xxxx  ',' xxooox ','xxooaoox','xoaoooox','xoooaoox',' xxooox ','  xxxx  '];
const COIN = ['  yyyy  ',' yyggyy ','yygwwgyy','yygwggyy','yygwggyy',' yyggy  ','  yyyy  '];
const FACE = ['  hhhhhh  ',' hhsssshh ',' hssssssh ','sswsswssss','ssbssbssss','ssssspssss',' ssm msss ','  smmmss  ','   ssss   '];
function sprite(ctx, rows, x, y, size, colors) {
  const cell = size / Math.max(...rows.map(row => row.length));
  for (let row = 0; row < rows.length; row++) for (let col = 0; col < rows[row].length; col++) {
    const color = colors[rows[row][col]];
    if (color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x + col * cell), Math.round(y + row * cell), Math.ceil(cell), Math.ceil(cell)); }
  }
}

// Rendering never advances a Flight. Face thumbnails are small canvases held
// only in memory, cleared when leaving a round; never serialized or uploaded.
export class PlankRenderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.reducedMotion = reducedMotion;
    this.width = 1; this.height = 1; this.visualTime = 0;
    this.shipXs = []; this.faceCrops = []; this.avatars = [];
    this.videoSize = ''; this.layout = '';
  }
  clearFaces() { this.avatars = []; this.faceCrops = []; }
  captureFaces(video, faces) {
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    faces.forEach((face, pilot) => {
      const crop = calculateFaceCrop(face, video.videoWidth, video.videoHeight, 1, 1);
      if (!crop) return;
      const canvas = this.avatars[pilot] ?? document.createElement('canvas');
      canvas.width = canvas.height = 20;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      // Crop closer than the full-screen face backdrop, with a little forehead.
      const side = Math.min(crop.width, crop.height) * .78;
      const x = crop.x + (crop.width - side) / 2, y = crop.y + (crop.height - side) / 2;
      try {
        ctx.setTransform(-1,0,0,1,20,0);
        ctx.drawImage(video,x,y,side,side,0,0,20,20);
        ctx.setTransform(1,0,0,1,0,0);
        const pixels = ctx.getImageData(0,0,20,20);
        for (let i = 0; i < pixels.data.length; i += 4) {
          for (let c = 0; c < 3; c++) pixels.data[i+c] = Math.round(pixels.data[i+c]/32)*32;
          // Cut square corners into a chunky sticker silhouette.
          const px = (i/4)%20, py = Math.floor(i/80);
          if ((px < 2 || px > 17) && (py < 2 || py > 17)) pixels.data[i+3] = 0;
        }
        ctx.putImageData(pixels,0,0); this.avatars[pilot] = canvas;
      } catch { /* Keep the last usable selfie through a camera interruption. */ }
    });
  }
  resize(width, height) {
    this.width = Math.max(1, Number(width) || 1);
    this.height = Math.max(1, Number(height) || 1);
    // Intentionally low-resolution scene, enlarged with nearest-neighbor CSS.
    const scale = .5;
    this.canvas.width = Math.round(this.width * scale);
    this.canvas.height = Math.round(this.height * scale);
    this.ctx.setTransform(scale,0,0,scale,0,0);
    this.ctx.imageSmoothingEnabled = false;
    this.layout = '';
  }
  draw({dt=0,phase='setup',mode='face',players=1,games=[],duration=30,hitGlows=[],video=null,faces=[],cameraActive=false,cameraOpacity=.55,lang='en'}={}) {
    const ctx=this.ctx, count=players===2?2:1;
    const step=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
    const inFlight=!!games[0]&&!['setup','framing','starting'].includes(phase);
    const layout=`${this.width}:${this.height}:${count}:${inFlight}`;
    if (layout!==this.layout) {this.shipXs=[];this.faceCrops=[];this.layout=layout;}
    const videoSize=video?`${video.videoWidth}:${video.videoHeight}`:'';
    if (videoSize!==this.videoSize) {this.faceCrops=[];this.videoSize=videoSize;}
    if (!this.reducedMotion&&!['paused','tracking'].includes(phase)) this.visualTime+=step;
    ctx.fillStyle='#0b1026';ctx.fillRect(0,0,this.width,this.height);
    for(let pilot=0;pilot<count;pilot++) {
      const width=this.width/count;
      ctx.save();ctx.beginPath();ctx.rect(pilot*width,0,width,this.height);ctx.clip();ctx.translate(pilot*width,0);
      this.drawArena({pilot,width,split:count===2,game:games[pilot],inFlight,mode,duration,dt:step,hitGlow:hitGlows[pilot]||0,
        video:cameraActive?video:null,face:faces[pilot],cameraOpacity,lang});
      ctx.restore();
    }
    if(count===2) {ctx.fillStyle='#100f29';ctx.fillRect(this.width/2-4,0,8,this.height);ctx.fillStyle='#7761a4';ctx.fillRect(this.width/2-1,0,2,this.height);}
  }
  drawArena({pilot,width,split,game,inFlight,mode,duration,dt,hitGlow,video,face,cameraOpacity,lang}) {
    const ctx=this.ctx,height=this.height,palette=PILOTS[pilot];
    const compact=this.width>height&&height<520;
    const cx=!split&&!inFlight&&width>799?width*.73:width*.5;
    const horizon=compact?Math.max(66,height*.24):height*.26;
    const shipY=height*(compact?.69:mode==='practice'&&inFlight?.69:.76);
    const spread=Math.min(width*(split?.32:.28),240);
    ctx.fillStyle=pilot?'#18132f':'#101b30';ctx.fillRect(0,0,width,height);
    const liveFace=this.drawCamera(video,face,pilot,width,height,cameraOpacity,dt);
    for(const star of STARS) {
      ctx.globalAlpha=liveFace?.4:.7;ctx.fillStyle=star.size>1?'#c6edeb':'#59637e';
      ctx.fillRect(Math.round(star.x*width/4)*4,Math.round(((star.y*height+this.visualTime*star.size*5)%height)/4)*4,star.size>1?4:2,star.size>1?4:2);
    }
    ctx.globalAlpha=1;
    // Pixel road: two lanes with stepped edges and moving crossbars.
    for(let i=0;i<16;i++) {
      const z=i/16,y=horizon+z*(height-horizon),road=spread*1.6*z;
      ctx.fillStyle=pilot?'#493452':'#28505a';
      ctx.fillRect(Math.round(cx-road),y,4,(height-horizon)/16+1);
      ctx.fillRect(Math.round(cx+road),y,4,(height-horizon)/16+1);
    }
    for(let i=0;i<9;i++) {
      const z=((i/9+this.visualTime*.045)%1)**2;
      ctx.fillStyle=pilot?'#43314e':'#23434e';ctx.fillRect(cx-2,horizon+z*(height-horizon),4,Math.max(3,10*z));
    }
    // Blocky moon and horizon marker.
    ctx.fillStyle='#e6ca82';ctx.fillRect(cx-10,horizon-35,20,20);ctx.fillRect(cx-14,horizon-31,28,12);
    ctx.fillStyle='#9b8c6c';ctx.fillRect(cx+2,horizon-31,8,8);ctx.fillRect(cx-8,horizon-23,4,4);
    const gates=game&&inFlight&&game.health>0?game.gates.map(g=>({...g,p:(game.elapsed-g.born)/(g.arrival-g.born)})):game&&inFlight?[]:[{lane:pilot?1:0,p:.55},{lane:pilot?0:1,p:.84}];
    for(const gate of gates) {
      const z=Math.max(0,gate.p)**1.4,y=horizon+(shipY-horizon)*z;
      if(y>height+50)continue;
      const direction=gate.lane===0?-1:1,x=cx+direction*spread*.56*z;
      const size=Math.max(12,Math.min(64,spread*.5)*z);
      ctx.globalAlpha=gate.resolved?.2:1;
      sprite(ctx,ROCK,x-size/2,y-size/2,size,{x:'#5b354e',o:'#e17d89',a:'#ffbd9a'});
      if(!gate.resolved) {
        const coinX=cx-direction*spread*.56*z,coinSize=Math.max(10,Math.min(32,spread*.25)*z);
        sprite(ctx,COIN,coinX-coinSize/2,y-coinSize/2,coinSize,{y:'#bd822b',g:'#ffd65c',w:'#fff0a3'});
      }
    }
    ctx.globalAlpha=1;
    const lane=game&&inFlight?game.lane:pilot?0:1,target=cx+(lane===0?-1:1)*spread*.56;
    this.shipXs[pilot]??=target;this.shipXs[pilot]+=(target-this.shipXs[pilot])*(this.reducedMotion?1:Math.min(1,dt*16));
    const size=Math.max(28,Math.min(52,width*.15,height*.17));
    if(game?.health===0)ctx.globalAlpha=.35;
    this.drawFace(this.shipXs[pilot],shipY,size,pilot,palette,hitGlow);
    ctx.globalAlpha=1;
    if(game&&inFlight) {
      const progress=Math.max(0,Math.min(1,game.elapsed/Math.max(1,duration)));
      ctx.fillStyle='#243347';ctx.fillRect(0,height-4,width,4);ctx.fillStyle=palette.glow;ctx.fillRect(0,height-4,width*progress,4);
      if(game.health===0) {ctx.fillStyle='#eee4ff';ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillText(lang==='zh'?'休息一下 · 为队友加油':'REST UP · CHEER YOUR BUDDY',cx,shipY+size);}
    }
    if(hitGlow>0&&!this.reducedMotion){ctx.fillStyle=`rgba(250,141,121,${Math.min(1,hitGlow)*.18})`;ctx.fillRect(0,0,width,height);}
  }
  drawFace(x,y,size,pilot,palette,hitGlow) {
    const ctx=this.ctx,cell=size/12,left=Math.round(x-size/2),top=Math.round(y-size/2);
    // Ridiculous floating selfie in a tiny rocket pack; camera-free mode gets a
    // toothy pixel gremlin, so neither mode falls back to an arrow.
    ctx.fillStyle=hitGlow>0?'#ff8994':palette.ship;
    ctx.fillRect(left-4,top,size+8,size);ctx.fillRect(left,top-4,size,size+8);
    ctx.fillStyle='#11172c';ctx.fillRect(left,top,size,size);
    ctx.imageSmoothingEnabled=false;
    if(this.avatars[pilot])ctx.drawImage(this.avatars[pilot],left+2,top+2,size-4,size-4);
    else sprite(ctx,FACE,left+2,top+2,size-4,{h:pilot?'#b47dca':'#6dccae',s:'#e5b087',w:'#fff8df',b:'#15213b',p:'#f48796',m:'#713757'});
    ctx.fillStyle=palette.exhaust;ctx.fillRect(left+cell,top+size+4,cell*2,cell*2);ctx.fillRect(left+cell*9,top+size+4,cell*2,cell*2);
    ctx.fillStyle='#ffd65c';const flame=this.reducedMotion?2:2+Math.floor(this.visualTime*8)%2;
    ctx.fillRect(left+cell*2,top+size+cell*2,cell,cell*flame);ctx.fillRect(left+cell*9,top+size+cell*2,cell,cell*flame);
  }
  drawCamera(video,face,pilot,width,height,opacity,dt) {
    const crop=video&&video.readyState>=2?calculateFaceCrop(face,video.videoWidth,video.videoHeight,width,height):null;
    if(!crop){this.faceCrops[pilot]=null;return false;}
    const previous=this.faceCrops[pilot],smoothing=Math.min(1,dt*8);
    if(previous)for(const key of ['x','y','width','height'])crop[key]=previous[key]+(crop[key]-previous[key])*smoothing;
    this.faceCrops[pilot]=crop;const ctx=this.ctx;
    ctx.save();
    try{ctx.translate(width,0);ctx.scale(-1,1);ctx.drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,width,height);}
    catch{this.faceCrops[pilot]=null;return false;}finally{ctx.restore();}
    ctx.fillStyle=`rgba(8,15,27,${1-Math.max(0,Math.min(.65,opacity))})`;ctx.fillRect(0,0,width,height);return true;
  }
}
