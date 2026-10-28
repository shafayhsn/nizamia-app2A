// Approximate denim/twill stitch factors from thread-calculator-spec.md.
// Values are YARDS of thread per INCH of seam, for ~8–10 SPI and 10oz+ fabrics.
// These are reference estimates, NOT factory-calibrated rates.
export const STITCH_FACTORS={
 chainSingle:{name:'401 single needle chainstitch',needle:0.078,looper:0.094},
 chainDouble:{name:'401 double needle chainstitch',needle:0.156,looper:0.183},
 lockSingle:{name:'301 single needle lockstitch',needle:0.083,looper:0.050},
 lockDouble:{name:'301 double needle lockstitch',needle:0.153,looper:0.092},
 overlock4:{name:'512 four-thread mock safety stitch',needle:0.181,looper:0.264},
 safety5:{name:'516 five-thread safety stitch',needle:0.194,looper:0.333},
 overlock3:{name:'504 three-thread overlock',needle:0.097,looper:0.236}
}
// Coats Sewing Solutions Thread Consumption Guide (2014), pp. 2–3.
// Ratios are total metres of thread per metre of seam at 18 SPI,
// split into needle and under/looper components. Do not apply at 8–10 SPI.
export const COATS_18_SPI={
 lockSingle:{ratio:2.5,needleShare:.50},
 lockDouble:{ratio:5.0,needleShare:.50}, // two parallel 301 rows (derived)
 chainSingle:{ratio:5.5,needleShare:.25},
 chainDouble:{ratio:11,needleShare:.25}, // two parallel 401 rows (derived)
 overlock3:{ratio:14,needleShare:.20}, // 504 three-thread overedge
 overlock4:{ratio:18,needleShare:.25}, // 512 four-thread mock safety
 safety5:{ratio:20,needleShare:.20} // 516 five-thread safety
}
// All lengths in inches; quantity is the number of equivalent seam lines.
// Additional lengths are explicitly estimates, not extracted from spec sheets.
// Generic garment construction model. All dimensions are inches.
// Flat widths are converted to full circumferences where required.
// Quantities and stitch lines are explicit; user options override defaults.
export function buildThreadOperations({type,dimensions,details={}}){
 const d=k=>Math.max(0,Number(dimensions[k])||0)
 const lower=['Jeans','Trousers','Shorts'].includes(type)
 const waist=(d('waist')||16)*(details.waistMeasure==='circumference'?1:2)
 const hip=(d('hip')||d('waist')*1.12||18)*(details.hipMeasure==='circumference'?1:2)
 const hem=(d('hem')||d('hip')*.55||9)*(details.hemMeasure==='circumference'?1:2)
 const leg=d('outseam')||d('length')||32
 const rise=d('rise')||leg*.27
 const inseam=d('inseam')||Math.max(1,leg-rise)
 const chest=(d('chest')||d('hip')||19)*2
 const length=d('length')||leg
 const sleeve=d('sleeve')||length*.65
 const shoulder=d('shoulder')||chest*.45
 const frontPockets=lower?Math.max(0,Number(details.frontPockets??2)):Math.max(0,Number(details.frontPockets??0))
 const backPockets=lower?Math.max(0,Number(details.backPockets??2)):Math.max(0,Number(details.backPockets??0))
 const extraPockets=Math.max(0,Number(details.extraPockets??(details.cargo?2:0)))
 const loops=Math.max(0,Number(details.beltLoops??(lower&&details.waistband!=='elastic'?5:0)))
 const hammerLoops=Math.max(0,Number(details.hammerLoops??0))
 const waistbandRows=Math.max(0,Number(details.waistbandRows??(details.waistband==='elastic'?3:1)))
 const topstitchLines=Math.max(1,Number(details.topstitchLines??(details.topstitch?2:1)))
 const rows=[]
 const add=(name,stitch,length,qty=1,channel='normal',assumed=true)=>{
  if(Number.isFinite(length)&&length>0&&qty>0)rows.push({name,stitch,length,qty,channel,assumed})
 }
 if(lower){
  // Two legs, each with one inseam, one outseam and one hem.
  add('Inseams (2 legs)','chainSingle',inseam,2)
  add('Outseams (2 legs)','chainDouble',leg,2)
  add('Seam edge finishing','overlock3',inseam+leg,2,'overlock')
  add('Front / back rise','chainSingle',rise*2.1,1)
  add('Waistband attachment','chainSingle',waist,1)
  add('Waistband topstitch rows','lockSingle',waist,waistbandRows)
  add('Leg hems (2 openings)','lockSingle',hem,2)
  add('Front pocket openings','lockSingle',hip*.28,frontPockets*topstitchLines)
  add('Front pocket bags','overlock3',hip*.45,frontPockets,'overlock')
  add('Back pocket attachment','lockSingle',hip*.38,backPockets)
  add('Back pocket topstitch','lockDouble',hip*.3,backPockets)
  add('Fly / mock fly','lockSingle',rise*.8,1)
  add('Belt loop making / attachment','lockSingle',4,loops)
  add('Hammer loop attachment','lockDouble',8,hammerLoops)
  add('Additional pocket attachment','lockDouble',hip*.55,extraPockets)
  add('Additional pocket finishing','overlock3',hip*.35,extraPockets,'overlock')
  if(details.topstitch)add('Additional leg topstitch','lockDouble',leg*.7,2)
 }else{
  add('Side seams','chainSingle',length,2)
  add('Shoulder seams','chainSingle',shoulder,2)
  add('Sleeve seams','chainSingle',sleeve,2)
  add('Armhole setting','chainSingle',chest*.55,2)
  add('Collar / neckline','lockSingle',chest*.6,1)
  add('Cuffs / sleeve hems','lockSingle',chest*.32,2)
  add('Body hem','lockSingle',chest,1)
  add('Placket / front opening','lockSingle',length,2)
  add('Front pockets','lockSingle',chest*.32,frontPockets)
  add('Back pockets','lockSingle',chest*.32,backPockets)
  add('Additional pockets','lockDouble',chest*.32,extraPockets)
  add('Raw edge finishing','overlock3',length+sleeve,2,'overlock')
  if(details.topstitch)add('Extra decorative topstitch','lockDouble',length*.6,2)
 }
 // Fixed short operations remain excluded until validated factory rates exist.
 return rows
}
export function estimateThread(operations,wastage=10,spi=9){
 const multiplier=1+Math.max(0,Number(wastage)||0)/100
 return operations.map(op=>{
  const f=STITCH_FACTORS[op.stitch]
  const inches=op.length*op.qty
  const coats=COATS_18_SPI[op.stitch]
  const useCoats=Number(spi)===18&&coats
  const needleFactor=useCoats?coats.ratio*coats.needleShare/2.54/0.9144:f.needle
  const looperFactor=useCoats?coats.ratio*(1-coats.needleShare)/2.54/0.9144:f.looper
  return {...op,needleYd:inches*needleFactor*multiplier,looperYd:inches*looperFactor*multiplier,stitchName:f.name}
 })
}
