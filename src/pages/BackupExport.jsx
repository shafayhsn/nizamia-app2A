import React, { useState } from 'react'
import { Download, AlertCircle } from 'lucide-react'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { exportAppData, generateExcelSheets } from '../lib/backupData'

export default function Backup() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleDownloadBackup = async () => {
    setError('')
    setLoading(true)

    try {
      // 1. Export all data from Supabase
      const backupData = await exportAppData()

      // 2. Create ZIP file
      const zip = new JSZip()

      // Add metadata JSON
      zip.file(
        'backup-metadata.json',
        JSON.stringify(backupData.backup_metadata, null, 2)
      )

      // Add raw data JSON
      zip.file(
        'data.json',
        JSON.stringify(backupData, null, 2)
      )

      // 3. Generate and add Excel sheets
      const excelSheets = generateExcelSheets(backupData)

      // Create Excel workbook
      const workbook = XLSX.utils.book_new()
      for (const sheet of excelSheets) {
        const worksheet = XLSX.utils.aoa_to_sheet(sheet.data)
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.sheetName)
      }

      // Convert workbook to binary
      const excelBinary = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      zip.file('data.xlsx', excelBinary)

      // 4. Generate ZIP and download
      const content = await zip.generateAsync({ type: 'blob' })

      // Create download link
      const now = new Date()
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`
      const filename = `nizamia-backup-${timestamp}.zip`

      const url = URL.createObjectURL(content)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setLoading(false)
    } catch (err) {
      console.error('Backup failed:', err)
      setError(`Failed to create backup: ${err.message}`)
      setLoading(false)
    }
  }

  return (
    <div>
      <Help text="Download a complete backup of all app data from Supabase. Includes JSON (for restore) and Excel (for inspection). Admin only." />

      {error && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16 }}>
          <AlertCircle size={18} color="#dc2626" style={{ marginTop: 1, flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: '#991b1b' }}>{error}</div>
        </div>
      )}

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, background: '#fafafa', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 12 }}>
          <strong>What's included:</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, fontSize: 12 }}>
            <li>All 16 app tables (orders, BOM, queues, samples, etc.)</li>
            <li>All relationships preserved (order_id, job_id, fitting_id, etc.)</li>
            <li>JSON file — complete data with all fields (for restore)</li>
            <li>Excel file — human-readable summary (large fields referenced)</li>
            <li>Metadata with timestamp and row counts</li>
          </ul>
        </div>
      </div>

      <button
        onClick={handleDownloadBackup}
        disabled={loading}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          background: loading ? '#d1d5db' : '#2383e2',
          color: '#fff',
          border: 'none',
          borderRadius: 9,
          fontSize: 13,
          fontWeight: 700,
          cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.7 : 1,
          transition: 'all 0.2s',
        }}
      >
        <Download size={16} />
        {loading ? 'Creating backup...' : 'Download Backup'}
      </button>

      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 12 }}>
        File format: <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>nizamia-backup-YYYY-MM-DD-HH-MM-SS.zip</code>
      </div>
    </div>
  )
}

function Help({ text }) {
  return <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, lineHeight: 1.55 }}>{text}</div>
}
