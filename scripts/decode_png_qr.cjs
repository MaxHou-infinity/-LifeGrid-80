'use strict';
// Independent decoder reads the FULL actual exported PNG, never an encoder matrix/data prefix.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PNG}=require('pngjs'),jsQR=require('jsqr');
const root=path.resolve(__dirname,'..');
const latest=path.join(root,'artifacts/local-v2/native-latest.json');
const defaultFolder=fs.existsSync(latest)?path.join(root,JSON.parse(fs.readFileSync(latest,'utf8')).runDirectory,'png'):path.join(root,'artifacts/local-v2/browser/png');
const folder=path.resolve(process.argv[2]||defaultFolder);
const files=fs.readdirSync(folder).filter(n=>n.endsWith('.png')).sort();assert.ok(files.length>=3,'Require actual normal consecutive PNGs and a 20-activity PNG');
const decoded=files.map(name=>{
 const file=path.join(folder,name),bytes=fs.readFileSync(file),png=PNG.sync.read(bytes,{checkCRC:true});
 assert.equal(png.width,1200);assert.ok(png.height>900);assert.equal(png.data.length,png.width*png.height*4);
 const result=jsQR(new Uint8ClampedArray(png.data),png.width,png.height,{inversionAttempts:'dontInvert'});
 assert.ok(result,'QR not decoded from FULL PNG: '+name);assert.equal(result.data,'https://maxhou.cn/static/life-calculator/index.html');
 return {file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),width:png.width,height:png.height,decodedURL:result.data,qrVersion:result.version};
});
const result={status:'PASS',decoder:'jsqr@1.4.0',parser:'pngjs@7.0.0',fullImages:true,count:decoded.length,decoded};
fs.writeFileSync(path.join(path.dirname(folder),'png-qr-decoded.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));console.log('EXIT_CODE=0');
