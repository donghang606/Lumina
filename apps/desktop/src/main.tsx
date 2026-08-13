import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

import '@arco-design/web-react/dist/css/arco.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/sora'
import '@fontsource-variable/space-grotesk'
import '@fontsource/space-mono'
import '@fontsource/space-mono/700.css'
import '@fontsource-variable/doto'
import './styles/tokens.css'
import './styles/arco-overrides.css'
import './styles/skins.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)