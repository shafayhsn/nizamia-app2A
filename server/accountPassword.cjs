const {randomBytes,scrypt,timingSafeEqual}=require('node:crypto')
const {promisify}=require('node:util')
const derive=promisify(scrypt)
async function hashPassword(password){
 const salt=randomBytes(16)
 return 'scrypt:'+salt.toString('hex')+':'+(await derive(password,salt,64)).toString('hex')
}
async function verifyPassword(password,stored){
 if(typeof stored!=='string'||!stored||typeof password!=='string'||Buffer.byteLength(password)>1024)return false
 const match=/^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored)
 const expected=match?Buffer.from(match[2],'hex'):Buffer.from(stored)
 const supplied=match?await derive(password,Buffer.from(match[1],'hex'),64):Buffer.from(password)
 return expected.length===supplied.length&&timingSafeEqual(expected,supplied)
}
module.exports={hashPassword,verifyPassword}
