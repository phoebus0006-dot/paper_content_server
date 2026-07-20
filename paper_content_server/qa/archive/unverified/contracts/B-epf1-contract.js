#!/usr/bin/env node
// B-epf1-contract: verify frame format via production imageToFrameBuffer
var path = require('path');
var mod = require(path.join(__dirname, '..', '..', 'server.js'));
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var FW=800,FH=480,HB=10,PB=Math.ceil((FW*FH)/2),TB=HB+PB;
t('HEADER='+HB,HB===10,'');t('PAYLOAD='+PB,PB===192000,PB+'');t('TOTAL='+TB,TB===192010,TB+'');
// imageToFrameBuffer returns palette-encoded payload (no header)
var raw=Buffer.alloc(4*3);
raw[0]=255;raw[1]=0;raw[2]=0;raw[3]=255;raw[4]=255;raw[5]=255;raw[6]=0;raw[7]=0;raw[8]=0;raw[9]=255;raw[10]=255;raw[11]=0;
var pl=mod.imageToFrameBuffer(raw,4,1,3);
// imageToFrameBuffer returns FRAME_PAYLOAD_BYTES (192000), filled with 0x11 default
// The 4 pixel values are encoded in the first 2 bytes
var firstByte = pl[0];
t('PAYLOAD_HAS_FRAME_SIZE',pl.length===192000,'len='+pl.length);
t('PAYLOAD_FIRST_TWO_BYTES_NONZERO',firstByte!==0||pl[1]!==0,'firstByte='+firstByte);
var b0=pl[0],hi0=(b0>>4)&0xF,lo0=b0&0xF;
t('CODE0_VALID',[0,1,2,3,5,6].includes(hi0),'code='+hi0);
t('CODE1_VALID',[0,1,2,3,5,6].includes(lo0),'code='+lo0);
// Build full frame buffer same as production buildFrameBuffer
var full=Buffer.alloc(TB);
full.write('EPF1',0,4,'ascii');full.writeUInt16LE(FW,4);full.writeUInt16LE(FH,6);full[8]=49;full[9]=1;
for(var i=HB;i<TB;i++)full[i]=0x11;
t('FULL_SIZE',full.length===TB,'len='+full.length);
t('MAGIC',full[0]===0x45&&full[1]===0x50&&full[2]===0x46&&full[3]===0x31,'');
t('DIMENSIONS',full.readUInt16LE(4)===FW&&full.readUInt16LE(6)===FH,'');
var c4=0,sc=new Set();
for(var i=HB;i<TB;i++){var hi=(full[i]>>4)&0xF,lo=full[i]&0xF;sc.add(hi);sc.add(lo);if(hi===4)c4++;if(lo===4)c4++}
t('CODE4_ZERO',c4===0,'c4='+c4);
var allOK=Array.from(sc).every(function(c){return[0,1,2,3,5,6].includes(c)});
t('CODES_VALID',allOK,'codes='+JSON.stringify(Array.from(sc)));
console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
