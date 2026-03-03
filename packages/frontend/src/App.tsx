import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkflowList } from './pages/WorkflowList';
import { WorkflowEditor } from './pages/WorkflowEditor';

function App() {
  return (
    <div className="h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<Navigate to="/workflows" replace />} />
        <Route path="/workflows" element={<WorkflowList />} />
        <Route path="/workflows/new" element={<WorkflowEditor />} />
        <Route path="/workflows/:id" element={<WorkflowEditor />} />
      </Routes>
    </div>
  );
}

export default App;
