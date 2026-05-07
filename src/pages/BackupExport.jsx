import React, { useMemo, useState } from 'react'
import { Download, AlertCircle, Upload, RotateCcw, ShieldAlert } from 'lucide-react'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { exportAppData, generateExcelSheets, restoreAppData, validateBackupPayload, BACKUP_TABLES } from '../lib/backupData'
import { useAuth } from '../lib/authContext'

export default function Backup() {
  const { user } = useAuth()
  const isAdmin = String(user?.role || '').toLowerCase() === 'admin'
  const [loading, setLoading] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [error, setError] = useState('')
  const [restoreError, setRestoreError] = useState('')
  const [restorePayload, setRestorePayload] = useState(null)
  const [restoreInfo, setRestoreInfo] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [progress, setProgress] = useState('')

  const canRestore = useMemo(() => isAdmin && restorePayload && confirmText.trim().toUpperCase() === 'RESET' && !restoreLoading, [isAdmin, restorePayload, confirmText, restoreLoading])

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

  const handleRestoreFile = async (event) => {
    const file = event.target.files?.[0]
    setRestorePayload(null)
    setRestoreInfo(null)
    setConfirmText('')
    setRestoreError('')
    setProgress('')
    if (!file) return

    try {
      if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('Please select a backup ZIP file.')
      const zip = await JSZip.loadAsync(file)
      const dataFile = zip.file('data.json')
      if (!dataFile) throw new Error('data.json not found in backup ZIP.')
      const raw = await dataFile.async('string')
      const payload = JSON.parse(raw)
      const info = validateBackupPayload(payload)
      setRestorePayload(payload)
      setRestoreInfo({ ...info, fileName: file.name, fileSize: file.size })
    } catch (err) {
      console.error('Restore file read failed:', err)
      setRestoreError(`Invalid backup file: ${err.message}`)
    } finally {
      event.target.value = ''
    }
  }

  const handleRestore = async () => {
    if (!canRestore) return
    setRestoreLoading(true)
    setRestoreError('')
    setProgress('Starting restore...')

    try {
      const result = await restoreAppData(restorePayload, {
        onProgress: p => setProgress(`${p.message} (${p.step}/${p.totalSteps})`),
      })
      setProgress(`Restore completed: ${result.restoredTables} tables, ${result.restoredRows} rows.`)
      window.setTimeout(() => window.location.reload(), 1200)
    } catch (err) {
      console.error('Restore failed:', err)
      setRestoreError(`Restore failed: ${err.message}`)
      setRestoreLoading(false)
    }
  }

  if (!isAdmin) {
    return (
      <div>
        <Help text="Backup and restore are admin-only controls." />
        <div style={noticeStyle('#fff7ed', '#fed7aa', '#9a3412')}>
          <ShieldAlert size={18} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 900, marginBottom: 4 }}>Access Denied</div>
            <div>Only admin users can download or restore app backups.</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Help text="Download a complete backup of all app data from Supabase, or restore from the same backup ZIP. Admin only." />

      {error && <ErrorBox text={error} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <section style={panelStyle}>
          <div style={sectionHeaderStyle}>Backup</div>
          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 14 }}>
            <strong>What's included:</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, fontSize: 12 }}>
              <li>All {BACKUP_TABLES.length} app tables.</li>
              <li>All relationships preserved.</li>
              <li>JSON file for restore.</li>
              <li>Excel file for inspection.</li>
              <li>Metadata with timestamp and row counts.</li>
            </ul>
          </div>

          <button onClick={handleDownloadBackup} disabled={loading} style={primaryButtonStyle(loading)}>
            <Download size={16} />
            {loading ? 'Creating backup...' : 'Download Backup'}
          </button>

          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 12 }}>
            Format: <code style={codeStyle}>nizamia-backup-YYYY-MM-DD-HH-MM-SS.zip</code>
          </div>
        </section>

        <section style={panelStyle}>
          <div style={sectionHeaderStyle}>Restore</div>
          <div style={noticeStyle('#fef2f2', '#fecaca', '#991b1b')}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>Danger Zone</div>
              <div>This will delete ALL current app data and replace it with the selected backup. This cannot be undone.</div>
            </div>
          </div>

          {restoreError && <ErrorBox text={restoreError} />}

          <label style={uploadBoxStyle}>
            <Upload size={18} />
            <span>Choose Backup ZIP</span>
            <input type="file" accept=".zip,application/zip" onChange={handleRestoreFile} style={{ display: 'none' }} disabled={restoreLoading} />
          </label>

          {restoreInfo && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginTop: 12, background: '#fff' }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#111827', marginBottom: 8 }}>Backup selected</div>
              <MetaRow label="File" value={restoreInfo.fileName} />
              <MetaRow label="Timestamp" value={restoreInfo.metadata?.timestamp || 'Not found'} />
              <MetaRow label="Tables" value={String(restoreInfo.tableNames?.length || 0)} />
              <MetaRow label="Rows" value={String(restoreInfo.totalRows || 0)} />

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#374151', marginBottom: 6 }}>Type RESET to confirm</div>
                <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="RESET" disabled={restoreLoading} style={inputStyle} />
              </div>

              <button onClick={handleRestore} disabled={!canRestore} style={dangerButtonStyle(!canRestore)}>
                <RotateCcw size={16} />
                {restoreLoading ? 'Restoring...' : 'Restore / Replace All Data'}
              </button>
            </div>
          )}

          {progress && <div style={{ fontSize: 12, color: restoreLoading ? '#374151' : '#166534', marginTop: 12, fontWeight: 800 }}>{progress}</div>}
        </section>
      </div>
    </div>
  )
}

function Help({ text }) {
  return <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, lineHeight: 1.55 }}>{text}</div>
}

function ErrorBox({ text }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16 }}>
      <AlertCircle size={18} color="#dc2626" style={{ marginTop: 1, flexShrink: 0 }} />
      <div style={{ fontSize: 13, color: '#991b1b' }}>{text}</div>
    </div>
  )
}

function MetaRow({ label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, padding: '4px 0', color: '#374151' }}><span style={{ color: '#6b7280' }}>{label}</span><strong style={{ textAlign: 'right', wordBreak: 'break-word' }}>{value}</strong></div>
}

const panelStyle = { border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, background: '#fafafa', minHeight: 250 }
const sectionHeaderStyle = { fontSize: 15, fontWeight: 900, color: '#111827', marginBottom: 12 }
const codeStyle = { background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }
const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 9, padding: '10px 12px', fontSize: 13, outline: 'none' }
const uploadBoxStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px dashed #cbd5e1', background: '#fff', borderRadius: 10, padding: 18, fontSize: 13, fontWeight: 900, color: '#111827', cursor: 'pointer' }
const noticeStyle = (background, border, color) => ({ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, background, border: `1px solid ${border}`, borderRadius: 8, marginBottom: 12, fontSize: 12, lineHeight: 1.5, color })
const primaryButtonStyle = (disabled) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: disabled ? '#d1d5db' : '#2383e2', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1, transition: 'all 0.2s' })
const dangerButtonStyle = (disabled) => ({ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', background: disabled ? '#e5e7eb' : '#dc2626', color: disabled ? '#9ca3af' : '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 900, cursor: disabled ? 'default' : 'pointer' })
