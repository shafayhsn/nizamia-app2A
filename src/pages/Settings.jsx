import React, { useState } from 'react'
import { X, Building2, Percent, FileText, Users, Lock, FileNumber, Ruler, Sliders } from 'lucide-react'

const SETTINGS_MODULES = [
  {
    id: 'company',
    icon: Building2,
    title: 'Company Info',
    description: 'Company details and branding',
    color: '#3b82f6'
  },
  {
    id: 'tax',
    icon: Percent,
    title: 'Tax',
    description: 'Tax rates and configurations',
    color: '#10b981'
  },
  {
    id: 'terms',
    icon: FileText,
    title: 'Terms & Conditions',
    description: 'Payment and delivery terms',
    color: '#f59e0b'
  },
  {
    id: 'users',
    icon: Users,
    title: 'User Management',
    description: 'Create and manage users',
    color: '#8b5cf6'
  },
  {
    id: 'permissions',
    icon: Lock,
    title: 'Roles & Permissions',
    description: 'Role-based access control',
    color: '#ef4444'
  },
  {
    id: 'numbering',
    icon: FileNumber,
    title: 'Document Numbering',
    description: 'PO, WO, and Job numbering schemes',
    color: '#06b6d4'
  },
  {
    id: 'uom',
    icon: Ruler,
    title: 'Unit of Measure',
    description: 'Weight, length, and volume units',
    color: '#ec4899'
  },
  {
    id: 'defaults',
    icon: Sliders,
    title: 'Defaults',
    description: 'Default values and preferences',
    color: '#14b8a6'
  }
]

function SettingsCard({ module, onClick }) {
  const Icon = module.icon
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: 24,
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.2s',
        width: '100%',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = module.color
        e.currentTarget.style.boxShadow = `0 4px 12px ${module.color}20`
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e5e7eb'
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{
        width: 56,
        height: 56,
        borderRadius: 12,
        backgroundColor: `${module.color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: module.color
      }}>
        <Icon size={28} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#1f2937',
          marginBottom: 4
        }}>
          {module.title}
        </div>
        <div style={{
          fontSize: 12,
          color: '#6b7280',
          lineHeight: 1.4
        }}>
          {module.description}
        </div>
      </div>
    </button>
  )
}

function Modal({ isOpen, title, onClose, children }) {
  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }} onClick={onClose}>
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: 12,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          maxWidth: 600,
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          position: 'sticky',
          top: 0,
          backgroundColor: 'white',
          zIndex: 10
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1f2937', margin: 0 }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: '#6b7280'
            }}
          >
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: '24px', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function CompanyInfo() {
  const [data, setData] = React.useState({
    companyName: 'Nizamia Industries',
    address: 'Karachi, Pakistan',
    phone: '+92-21-1234567',
    email: 'info@nizamia.com'
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Object.entries(data).map(([key, value]) => (
        <div key={key}>
          <label style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            color: '#6b7280',
            marginBottom: 6,
            letterSpacing: 0.5
          }}>
            {key.replace(/([A-Z])/g, ' $1').trim()}
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setData({ ...data, [key]: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 13,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              boxSizing: 'border-box'
            }}
          />
        </div>
      ))}
      <button style={{
        marginTop: 16,
        padding: '10px 16px',
        backgroundColor: '#2383e2',
        color: 'white',
        border: 'none',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer'
      }}>
        Save Changes
      </button>
    </div>
  )
}

function TaxSettings() {
  const [taxRate, setTaxRate] = React.useState(18)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{
          display: 'block',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          color: '#6b7280',
          marginBottom: 6,
          letterSpacing: 0.5
        }}>
          Default Tax Rate (%)
        </label>
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={taxRate}
          onChange={(e) => setTaxRate(parseFloat(e.target.value))}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 13,
            border: '1px solid #d1d5db',
            borderRadius: 6,
            boxSizing: 'border-box'
          }}
        />
      </div>
      <div style={{
        padding: 12,
        backgroundColor: '#f0f9ff',
        borderLeft: '4px solid #2383e2',
        borderRadius: 6,
        fontSize: 12,
        color: '#1e40af'
      }}>
        This rate will be applied to all purchase orders by default.
      </div>
      <button style={{
        marginTop: 16,
        padding: '10px 16px',
        backgroundColor: '#2383e2',
        color: 'white',
        border: 'none',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer'
      }}>
        Save Changes
      </button>
    </div>
  )
}

function TermsSettings() {
  const [terms, setTerms] = React.useState({
    paymentTerms: 'Net 30 days',
    deliveryTerms: 'FOB Origin',
    notes: 'All terms subject to approval'
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Object.entries(terms).map(([key, value]) => (
        <div key={key}>
          <label style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            color: '#6b7280',
            marginBottom: 6,
            letterSpacing: 0.5
          }}>
            {key.replace(/([A-Z])/g, ' $1').trim()}
          </label>
          <textarea
            value={value}
            onChange={(e) => setTerms({ ...terms, [key]: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 13,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              boxSizing: 'border-box',
              minHeight: 80,
              fontFamily: 'inherit'
            }}
          />
        </div>
      ))}
      <button style={{
        marginTop: 16,
        padding: '10px 16px',
        backgroundColor: '#2383e2',
        color: 'white',
        border: 'none',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer'
      }}>
        Save Changes
      </button>
    </div>
  )
}

function UserManagement() {
  const [users, setUsers] = React.useState([
    { id: 1, username: 'admin', email: 'admin@nizamia.com', role: 'admin', active: true },
    { id: 2, username: 'gm1', email: 'gm@nizamia.com', role: 'gm', active: true },
  ])
  const [showForm, setShowForm] = React.useState(false)
  const [newUser, setNewUser] = React.useState({
    username: '',
    email: '',
    role: 'merchandiser',
    password: ''
  })

  const handleAddUser = () => {
    if (!newUser.username || !newUser.email) return
    const pwd = newUser.password || Math.random().toString(36).slice(2, 10)
    setUsers([...users, {
      id: users.length + 1,
      ...newUser,
      password: pwd,
      active: true
    }])
    setNewUser({ username: '', email: '', role: 'merchandiser', password: '' })
    setShowForm(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button
        onClick={() => setShowForm(!showForm)}
        style={{
          padding: '10px 16px',
          backgroundColor: '#2383e2',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          alignSelf: 'flex-start'
        }}
      >
        {showForm ? 'Cancel' : '+ Add User'}
      </button>

      {showForm && (
        <div style={{
          padding: 16,
          backgroundColor: '#f9fafb',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <input
            type="text"
            placeholder="Username"
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            style={{
              padding: '8px 12px',
              fontSize: 13,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              boxSizing: 'border-box'
            }}
          />
          <input
            type="email"
            placeholder="Email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            style={{
              padding: '8px 12px',
              fontSize: 13,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              boxSizing: 'border-box'
            }}
          />
          <select
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            style={{
              padding: '8px 12px',
              fontSize: 13,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              boxSizing: 'border-box'
            }}
          >
            <option value="admin">Admin</option>
            <option value="gm">GM</option>
            <option value="merchandiser">Merchandiser</option>
          </select>
          <small style={{ color: '#6b7280' }}>
            Leave password empty to auto-generate
          </small>
          <button
            onClick={handleAddUser}
            style={{
              padding: '8px 12px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Create User
          </button>
        </div>
      )}

      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 13
      }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: 8, textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Username</th>
            <th style={{ padding: 8, textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Email</th>
            <th style={{ padding: 8, textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Role</th>
            <th style={{ padding: 8, textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: 8, color: '#1f2937' }}>{u.username}</td>
              <td style={{ padding: 8, color: '#6b7280', fontSize: 12 }}>{u.email}</td>
              <td style={{ padding: 8, color: '#1f2937' }}><span style={{
                display: 'inline-block',
                padding: '4px 8px',
                backgroundColor: u.role === 'admin' ? '#fee2e2' : '#dbeafe',
                color: u.role === 'admin' ? '#991b1b' : '#1e40af',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600
              }}>{u.role}</span></td>
              <td style={{ padding: 8, color: u.active ? '#10b981' : '#6b7280' }}>
                {u.active ? 'Active' : 'Inactive'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RolesAndPermissions() {
  return (
    <div style={{ color: '#6b7280', fontSize: 13 }}>
      <p>Role definitions and permission matrix coming soon.</p>
      <p>Manage access control for admin, GM, and Merchandiser roles.</p>
    </div>
  )
}

function DocumentNumbering() {
  return (
    <div style={{ color: '#6b7280', fontSize: 13 }}>
      <p>Configure numbering schemes for:</p>
      <ul>
        <li>Purchase Orders (PO-2026-XXXXX)</li>
        <li>Work Orders (WO-XXXXX)</li>
        <li>Job Numbers (JOB-XXXXX)</li>
      </ul>
    </div>
  )
}

function UnitOfMeasure() {
  return (
    <div style={{ color: '#6b7280', fontSize: 13 }}>
      <p>Standard units for:</p>
      <ul>
        <li>Weight: KG, LBS, G</li>
        <li>Length: M, CM, INCHES, YARDS</li>
        <li>Volume: CBM, LITERS, GALLONS</li>
      </ul>
    </div>
  )
}

function Defaults() {
  return (
    <div style={{ color: '#6b7280', fontSize: 13 }}>
      <p>Set default values for new orders and documents:</p>
      <ul>
        <li>Default currency</li>
        <li>Default tax rate</li>
        <li>Default payment terms</li>
        <li>Default lead time</li>
      </ul>
    </div>
  )
}

export default function Settings() {
  const [openModal, setOpenModal] = React.useState(null)

  const renderModalContent = () => {
    switch (openModal) {
      case 'company':
        return <CompanyInfo />
      case 'tax':
        return <TaxSettings />
      case 'terms':
        return <TermsSettings />
      case 'users':
        return <UserManagement />
      case 'permissions':
        return <RolesAndPermissions />
      case 'numbering':
        return <DocumentNumbering />
      case 'uom':
        return <UnitOfMeasure />
      case 'defaults':
        return <Defaults />
      default:
        return null
    }
  }

  const getModuleTitle = () => {
    const module = SETTINGS_MODULES.find(m => m.id === openModal)
    return module?.title || 'Settings'
  }

  return (
    <div style={{
      padding: 32,
      backgroundColor: '#f7f7f5',
      minHeight: '100vh'
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 40 }}>
          <h1 style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#1a1a2e',
            marginBottom: 8
          }}>
            Settings
          </h1>
          <p style={{
            fontSize: 13,
            color: '#6b7280'
          }}>
            Manage your application configuration and preferences
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 20
        }}>
          {SETTINGS_MODULES.map(module => (
            <SettingsCard
              key={module.id}
              module={module}
              onClick={() => setOpenModal(module.id)}
            />
          ))}
        </div>
      </div>

      <Modal
        isOpen={!!openModal}
        title={getModuleTitle()}
        onClose={() => setOpenModal(null)}
      >
        {renderModalContent()}
      </Modal>
    </div>
  )
}
