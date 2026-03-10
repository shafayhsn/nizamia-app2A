import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Purchasing from './pages/Purchasing'
import Buyers from './pages/Buyers'
import Suppliers from './pages/Suppliers'
import Library from './pages/Library'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="orders/*" element={<Orders />} />
        <Route path="purchasing/*" element={<Purchasing />} />
        <Route path="buyers" element={<Buyers />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="library" element={<Library />} />
      </Route>
    </Routes>
  )
}
