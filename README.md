# TeamFlow — Guía de instalación

## Paso 1: Configurar Supabase

1. Ve a **supabase.com** y crea una cuenta gratuita
2. Crea un nuevo proyecto (anota la contraseña)
3. Espera ~2 minutos a que termine de iniciar
4. En el menú izquierdo ve a **SQL Editor** → **New Query**
5. Pega todo el contenido de `supabase-schema.sql` y presiona **Run**
6. Ve a **Project Settings** → **API**
7. Copia:
   - **Project URL** → la necesitas para el `.env`
   - **anon / public key** → la necesitas para el `.env`

## Paso 2: Crear el archivo .env

Crea un archivo llamado `.env` en la raíz del proyecto (junto a `package.json`):

```
VITE_SUPABASE_URL=https://TUPROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
```

## Paso 3: Instalar y correr localmente

```bash
npm install
npm run dev
```

Abre http://localhost:5173

## Paso 4: Crear tu primer usuario Admin

1. En Supabase ve a **Authentication** → **Users** → **Invite user**
2. Ingresa el email del admin y envía la invitación
3. El admin debe hacer clic en el link del correo y establecer contraseña
4. Ve a **Table Editor** → **profiles** → busca ese usuario
5. Cambia el campo `role` de `user` a `admin`
6. ¡Listo! Ese usuario ahora tiene acceso de admin

Para crear más usuarios: repite el mismo proceso. Por defecto todos son `user`.

## Paso 5: Desplegar en Netlify

1. Sube el proyecto a GitHub
2. En **netlify.com** → **Add new site** → **Import from Git**
3. Selecciona tu repo
4. Build command: `npm run build`
5. Publish directory: `dist`
6. En **Environment variables** agrega las mismas variables del `.env`
7. Deploy!

---

## Estructura del proyecto

```
src/
├── components/
│   ├── auth/        # Login, guards de rutas
│   └── layout/      # Sidebar, AppLayout
├── context/         # AuthContext (sesión global)
├── lib/             # Cliente Supabase
├── pages/           # Dashboard y demás páginas
└── index.css        # Estilos globales
```

## Módulos planificados

- [x] Módulo 1: Auth + estructura base + Dashboard
- [ ] Módulo 2: Tablero Kanban de tareas/clientes
- [ ] Módulo 3: Cronograma diario con notificaciones
- [ ] Módulo 4: Chat por tarea
- [ ] Módulo 5: Panel admin + gestión de equipo
