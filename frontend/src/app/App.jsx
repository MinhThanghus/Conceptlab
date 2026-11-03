import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { I18nProvider } from '../i18n/index.jsx'
import { AuthProvider } from '../features/auth/AuthContext.jsx'
import { ToastProvider } from '../components/ui/index.js'
import { routes } from './routes.jsx'

const router = createBrowserRouter(routes)

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  )
}
