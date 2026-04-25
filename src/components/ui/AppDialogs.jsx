import React from 'react'

export function useAppDialogs() {
  const alert = React.useCallback(async (message) => {
    window.alert(String(message ?? ''))
    return true
  }, [])

  const confirm = React.useCallback(async (message) => {
    return window.confirm(String(message ?? 'Are you sure?'))
  }, [])

  const prompt = React.useCallback(async (message, defaultValue = '') => {
    return window.prompt(String(message ?? ''), defaultValue)
  }, [])

  const Dialogs = React.useCallback(() => null, [])
  return { alert, confirm, prompt, Dialogs }
}

export default useAppDialogs
