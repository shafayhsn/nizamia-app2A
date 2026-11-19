import React from 'react'
import { Eye, EyeOff, Lock, UserRound } from 'lucide-react'
import denim from '../assets/login-denim.svg'
import mark from '../assets/login-mark.svg'
import footer from '../assets/login-footer.svg'
import './desktop-login.css'

export default function LoginForm({ identifier, setIdentifier, password, setPassword, remember, setRemember,
  showPassword, setShowPassword, busy, error, setError, handleSubmit, offlineSetupRequired = false, version }) {
  return <main className="desktop-login">
    <div className="dl-card">
      <div className="dl-denim"><img src={denim} alt="Nizamia Apparels. From tech-packs to shipments, faster. www.nizamia.com" /></div>
      <form className="dl-form" onSubmit={handleSubmit}>
        <img className="dl-mark" src={mark} alt="Nizamia" />
        <h1>{offlineSetupRequired ? 'Set Up Offline Account' : 'Let’s get to work'}</h1>
        <p className="dl-intro">{offlineSetupRequired ? 'Create a local account for this computer. Use a password of at least 12 characters. This account does not access Supabase.' : 'Speed up your work with NZOS'}</p>
        <label htmlFor="dl-user">Username</label>
        <div className="dl-input"><UserRound /><input id="dl-user" autoComplete="username" value={identifier} onChange={e => setIdentifier(e.target.value)} /></div>
        <div className="dl-row"><label htmlFor="dl-pass">Password</label>
          <button type="button" onClick={() => setError('Please contact Admin to reset your password.')}>Forgot Password?</button>
        </div>
        <div className="dl-input"><Lock /><input id="dl-pass" autoComplete={offlineSetupRequired ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} />
          <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</button>
        </div>
        <label className="dl-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />Remember me on this computer</label>
        {error && <p role="alert">{error}</p>}
        <button className="dl-submit" disabled={busy}>{busy ? 'Please wait...' : 'Log in'}</button>
        <p className="dl-notice">By signing in, you agree to access Nizamia OMS strictly for authorized production and order management tasks. All tech packs, cutting plans, and factory data remain confidential company property and must not be shared externally. Unauthorized use or credential sharing is prohibited.</p>
        <footer><img src={footer} alt="NZOS 2026 ®. Designed for Nizamia Apparels" /><span>V {version}</span></footer>
      </form>
    </div>
  </main>
}
