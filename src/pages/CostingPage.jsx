import React from 'react'
import { useNavigate } from 'react-router-dom'
import CostingSheet from '../components/tools/CostingSheet'

export default function CostingPage(){
  const navigate=useNavigate()
  return <div style={{height:'100%',minHeight:0,overflow:'hidden',background:'#fff'}}>
    <CostingSheet onClose={()=>navigate('/features')} />
  </div>
}
