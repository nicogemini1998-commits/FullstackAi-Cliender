import { useState, useEffect } from 'react'

export function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('lu_theme')
    return saved ? saved === 'dark' : true // dark por defecto
  })

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.add('light')
    }
    localStorage.setItem('lu_theme', dark ? 'dark' : 'light')
  }, [dark])

  return { dark, toggle: () => setDark(v => !v) }
}
