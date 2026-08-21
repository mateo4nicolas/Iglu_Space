import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ProtectedRoute, AdminRoute, PublicOnlyRoute } from './components/auth/RouteGuards'
import AppLayout from './components/layout/AppLayout'
import Login from './components/auth/Login'
import Dashboard from './pages/Dashboard'
import CronogramaPage from './pages/Cronograma'
import DepartamentosPage from './pages/Departamentos'
import EquipoPage from './pages/Equipo'
import AdminPage from './pages/Admin'
import LogDiarioPage from './pages/LogDiario'
import GrabacionesPage from './pages/Grabaciones'
import ClientesPage from './pages/Clientes'
import MatrizPage from './pages/Matriz'
import AgendaGestionPage from './pages/AgendaGestion'
import ContenidoExtraPage from './pages/ContenidoExtra'
import ConfiguracionPage from './pages/Configuracion'
import ToastContainer from './components/ui/Toast'

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/dashboard"     element={<Dashboard />} />
            <Route path="/cronograma"    element={<CronogramaPage />} />
            <Route path="/departamentos" element={<DepartamentosPage />} />
            <Route path="/log-diario"    element={<LogDiarioPage />} />
            <Route path="/grabaciones"   element={<GrabacionesPage />} />
            <Route path="/clientes"      element={<AdminRoute><ClientesPage /></AdminRoute>} />
            <Route path="/matriz"        element={<MatrizPage />} />
            <Route path="/contenido-extra" element={<ContenidoExtraPage />} />
            <Route path="/agenda-gestion" element={<AdminRoute><AgendaGestionPage /></AdminRoute>} />
            <Route path="/equipo"        element={<AdminRoute><EquipoPage /></AdminRoute>} />
            <Route path="/admin"         element={<AdminRoute><AdminPage /></AdminRoute>} />
            <Route path="/configuracion" element={<ConfiguracionPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <ToastContainer />
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  )
}
