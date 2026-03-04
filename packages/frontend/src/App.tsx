import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { WorkflowList } from './pages/WorkflowList';
import { WorkflowEditor } from './pages/WorkflowEditor';
import { ExecutionList } from './pages/ExecutionList';
import { ExecutionDetail } from './pages/ExecutionDetail';
import { HITLList } from './pages/HITLList';
import { CredentialsList } from './pages/CredentialsList';
import { CustomNodeList } from './pages/CustomNodeList';
import { CustomNodeEditor } from './pages/CustomNodeEditor';
import { DomainList } from './pages/DomainList';
import { ScenarioList } from './pages/ScenarioList';
import { CaseList } from './pages/CaseList';
import { CaseChat } from './pages/CaseChat';

function App() {
  return (
    <div className="h-screen bg-background text-foreground">
      <Routes>
        <Route path="/" element={<Navigate to="/workflows" replace />} />
        {/* Sidebar layout */}
        <Route element={<AppLayout />}>
          <Route path="/workflows" element={<WorkflowList />} />
          <Route path="/executions" element={<ExecutionList />} />
          <Route path="/executions/:id" element={<ExecutionDetail />} />
          <Route path="/hitl" element={<HITLList />} />
          <Route path="/credentials" element={<CredentialsList />} />
          <Route path="/custom-nodes" element={<CustomNodeList />} />
          <Route path="/domains" element={<DomainList />} />
          <Route path="/scenarios" element={<ScenarioList />} />
          <Route path="/cases" element={<CaseList />} />
        </Route>
        {/* Full-screen pages (no sidebar) */}
        <Route path="/workflows/new" element={<WorkflowEditor />} />
        <Route path="/workflows/:id" element={<WorkflowEditor />} />
        <Route path="/custom-nodes/new" element={<CustomNodeEditor />} />
        <Route path="/custom-nodes/:id/edit" element={<CustomNodeEditor />} />
        <Route path="/cases/:id/chat" element={<CaseChat />} />
      </Routes>
    </div>
  );
}

export default App;
