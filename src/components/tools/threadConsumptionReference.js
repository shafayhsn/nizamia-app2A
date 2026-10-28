// Approximate denim/twill stitch factors from thread-calculator-spec.md.
// Values are YARDS of thread per INCH of seam, for ~8–10 SPI and 10oz+ fabrics.
// These are reference estimates, NOT factory-calibrated rates.
export const STITCH_FACTORS={
 chainSingle:{name:'401 single needle chainstitch',needle:0.078,looper:0.094},
 chainDouble:{name:'401 double needle chainstitch',needle:0.156,looper:0.183},
 lockSingle:{name:'301 single needle lockstitch',needle:0.083,looper:0.050},
 lockDouble:{name:'301 double needle lockstitch',needle:0.153,looper:0.092},
 overlock4:{name:'504 four-thread overlock',needle:0.181,looper:0.264},
 safety5:{name:'516 five-thread safety stitch',needle:0.194,looper:0.333},
 overlock3:{name:'503/504 three-thread overlock',needle:0.097,looper:0.236}
}
// All lengths in inches; quantity is the number of equivalent seam lines.
// Additional lengths are explicitly estimates, not extracted from spec sheets.
export function buildThreadOperations({type,dimensions,details}){
 const d=k=>Math.max(0,Number(dimensions[k])||0)
 const waist=d('waist')||32,hip=d('hip')||waist*1.12
 const leg=d('outseam')||d('inseam')||d('length')||32
 const inseam=d('inseam')||leg*.75
 const rise=d('rise')||Math.max(7,leg*.27)
 const hem=d('hem')||hip*.55
 const sleeve=d('sleeve')||22,chest=d('chest')||hip*.65,shoulder=d('shoulder')||17
 const isJacket=type==='Jacket'
 const isTwill=type==='Trousers'||type==='Shorts'
 const rows=[]
 const add=(name,stitch,length,qty=1,channel='normal',assumed=true)=>{
  if(length>0&&qty>0)rows.push({name,stitch,length,qty,channel,assumed})
 }
 if(isJacket){
  add('Side and sleeve seams','chainDouble',leg+sleeve,2)
  add('Armhole setting','chainDouble',chest*1.3,2)
  add('Shoulders','chainSingle',shoulder,2)
  add('Collar / cuffs / placket','lockSingle',chest*2+sleeve*1.2)
  add('Chest pockets / flaps','lockDouble',chest*.8,2)
  add('Hem / waistband','lockSingle',chest*2)
  if(details.cargo)add('Additional pockets','lockDouble',chest*.9,2)
  if(details.reinforced)add('Raw-edge finish','overlock3',leg+chest*2,1,'overlock')
 }else{
  add('Inseams',isTwill?'overlock4':'chainSingle',inseam,2,isTwill?'overlock':'normal',false)
  add('Outseams',isTwill?'overlock4':'chainDouble',leg,2,isTwill?'overlock':'normal',false)
  add('Back rise and yoke','chainDouble',rise*1.7,1)
  add('Front rise / crotch',isTwill?'safety5':'chainSingle',rise*1.5,1,isTwill?'overlock':'normal')
  add('Waistband attach and topstitch','lockSingle',waist,2)
  add('Hems','lockSingle',hem,2)
  add('Back pocket decorative stitch','lockDouble',hip*.5,2)
  add('Back pocket attach and hem','lockSingle',hip*.7,2)
  add('Pocket bag finishing','overlock3',hip*.75,2,'overlock')
  if(details.cargo){
   add('Cargo pocket and flap attach','lockDouble',hip*.85,4)
   add('Extra pocket edge finish','overlock3',hip*.7,2,'overlock')
  }
 }
 if(details.topstitch)add('Additional decorative topstitch','lockDouble',leg*.65,2)
 // Bartacks and buttonholes require fixed yards-per-piece reference data.
 // Do not fabricate a stitch-per-inch estimate for those short operations.
 return rows
}
export function estimateThread(operations,wastage=10){
 const multiplier=1+Math.max(0,Number(wastage)||0)/100
 return operations.map(op=>{
  const f=STITCH_FACTORS[op.stitch]
  const inches=op.length*op.qty
  return {...op,needleYd:inches*f.needle*multiplier,looperYd:inches*f.looper*multiplier,stitchName:f.name}
 })
}
