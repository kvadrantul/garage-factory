import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkflowList } from './pages/WorkflowList';
import { WorkflowEditor } from './pages/WorkflowEditor';
import { ExecutionList } from './pages/ExecutionList';
import { ExecutionDetail } from './pages/ExecutionDetail';
import { HITLList } from './pages/HITLList';

function App() {
  return (
    <div className="h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<Navigate to="/workflows" replace />} />
        <Route path="/workflows" element={<WorkflowList />} />
        <Route path="/workflows/new" element={<WorkflowEditor />} />
        <Route path="/workflows/:id" element={<WorkflowEditor />} />
        <Route path="/executions" element={<ExecutionList />} />
        <Route path="/executions/:id" element={<ExecutionDetail />} />
        <Route path="/hitl" element={<HITLList />} />
      </Routes>
    </div>
  );
}

export default App;
