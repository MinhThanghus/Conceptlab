import { lazy, Suspense } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { AdminLayout, AppLayout, LearnerLayout, PublicLayout } from '../components/layout/Layouts.jsx'
import { LoadingBlock } from '../components/ui/index.js'
import { useAuth } from '../features/auth/AuthContext.jsx'

// Pages are code-split so learners on slow connections only download what they open.
const HomePage = lazy(() => import('../features/public/HomePage.jsx'))
const GalleryPage = lazy(() => import('../features/public/GalleryPage.jsx'))
const GuidePage = lazy(() => import('../features/public/GuidePage.jsx'))
const GeoLessonPage = lazy(() => import('../features/geography/GeoLessonPage.jsx'))
const LearnPage = lazy(() => import('../features/science/LearnPage.jsx'))
const VisualLibrary = lazy(() => import('../features/visuals/VisualLibrary.jsx'))
const PaperStudyLibrary = lazy(() => import('../features/study/PaperStudyLibrary.jsx'))
const MoleculePage = lazy(() => import('../features/science/MoleculePage.jsx'))
const VisionPage = lazy(() => import('../features/vision/VisionPage.jsx'))
const AlgorithmsPage = lazy(() => import('../features/blocks/algorithm/AlgorithmsPage.jsx'))
const StructuresPage = lazy(() => import('../features/structures/StructuresPage.jsx'))
const JoinPage = lazy(() => import('../features/public/JoinPage.jsx'))
const NotFoundPage = lazy(() => import('../features/public/NotFoundPage.jsx'))
const LoginPage = lazy(() => import('../features/auth/LoginPage.jsx'))
const RegisterPage = lazy(() => import('../features/auth/RegisterPage.jsx'))
const SharedLabPage = lazy(() => import('../features/explorer/SharedLabPage.jsx'))
const LiteHome = lazy(() => import('../features/lite/LiteHome.jsx'))
const LiteLab = lazy(() => import('../features/lite/LiteLab.jsx'))
const MyLabsPage = lazy(() => import('../features/labs/MyLabsPage.jsx'))
const StudentHome = lazy(() => import('../features/student/StudentHome.jsx'))
const NewLabPage = lazy(() => import('../features/labs/NewLabPage.jsx'))
const AccountPage = lazy(() => import('../features/account/AccountPage.jsx'))
const LabStudioLayout = lazy(() => import('../features/studio/LabStudioLayout.jsx'))
const SourcesStep = lazy(() => import('../features/studio/SourcesStep.jsx'))
const AnalyzeStep = lazy(() => import('../features/studio/AnalyzeStep.jsx'))
const ReviewStep = lazy(() => import('../features/studio/ReviewStep.jsx'))
const PaperStep = lazy(() => import('../features/paper/PaperStep.jsx'))
const BuildStep = lazy(() => import('../features/studio/BuildStep.jsx'))
const PreviewStep = lazy(() => import('../features/studio/PreviewStep.jsx'))
const PublishStep = lazy(() => import('../features/studio/PublishStep.jsx'))
const ResultsStep = lazy(() => import('../features/studio/ResultsStep.jsx'))
const AdminDashboardPage = lazy(() => import('../features/admin/AdminDashboardPage.jsx'))
const AdminUsersPage = lazy(() => import('../features/admin/AdminUsersPage.jsx'))
const AdminLabsPage = lazy(() => import('../features/admin/AdminLabsPage.jsx'))
const AdminAIPage = lazy(() => import('../features/admin/AdminAIPage.jsx'))
const AdminFeedbackPage = lazy(() => import('../features/admin/AdminFeedbackPage.jsx'))

function page(Component) {
  return (
    <Suspense
      fallback={
        <div className="container page">
          <LoadingBlock lines={4} height="10rem" />
        </div>
      }
    >
      <Component />
    </Suspense>
  )
}

function ShareRedirect() {
  const { code } = useParams()
  return <Navigate to={`/s/${(code || '').toUpperCase()}`} replace />
}

function AppIndex() {
  const { user } = useAuth()
  return user?.role === 'student' ? page(StudentHome) : page(MyLabsPage)
}

export const routes = [
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: page(HomePage) },
      { path: '/gallery', element: page(GalleryPage) },
      { path: '/guide', element: page(GuidePage) },
      { path: '/learn/geography', element: page(GeoLessonPage) },
      { path: '/learn', element: page(LearnPage) },
      { path: '/learn/3d', element: page(VisualLibrary) },
      { path: '/learn/research', element: page(PaperStudyLibrary) },
      { path: '/learn/molecules', element: page(MoleculePage) },
      { path: '/learn/vision', element: page(VisionPage) },
      { path: '/learn/algorithms', element: page(AlgorithmsPage) },
      { path: '/learn/structures', element: page(StructuresPage) },
      { path: '/join', element: page(JoinPage) },
      { path: '/join/:code', element: <ShareRedirect /> },
      { path: '/login', element: page(LoginPage) },
      { path: '/register', element: page(RegisterPage) },
    ],
  },
  {
    element: <LearnerLayout />,
    children: [
      { path: '/s/:code', element: page(SharedLabPage) },
      { path: '/lite', element: page(LiteHome) },
      { path: '/lite/:code', element: page(LiteLab) },
    ],
  },
  {
    path: '/app',
    element: <AppLayout />,
    children: [
      { index: true, element: <AppIndex /> },
      { path: 'manage', element: page(MyLabsPage) },
      { path: 'new', element: page(NewLabPage) },
      { path: 'account', element: page(AccountPage) },
      {
        path: 'labs/:labId',
        element: page(LabStudioLayout),
        children: [
          { index: true, element: <Navigate to="sources" replace /> },
          { path: 'sources', element: page(SourcesStep) },
          { path: 'analyze', element: page(AnalyzeStep) },
          { path: 'review', element: page(ReviewStep) },
          { path: 'paper', element: page(PaperStep) },
          { path: 'build', element: page(BuildStep) },
          { path: 'preview', element: page(PreviewStep) },
          { path: 'publish', element: page(PublishStep) },
          { path: 'results', element: page(ResultsStep) },
        ],
      },
    ],
  },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: page(AdminDashboardPage) },
      { path: 'users', element: page(AdminUsersPage) },
      { path: 'labs', element: page(AdminLabsPage) },
      { path: 'ai', element: page(AdminAIPage) },
      { path: 'feedback', element: page(AdminFeedbackPage) },
    ],
  },
  {
    element: <PublicLayout />,
    children: [{ path: '*', element: page(NotFoundPage) }],
  },
]
