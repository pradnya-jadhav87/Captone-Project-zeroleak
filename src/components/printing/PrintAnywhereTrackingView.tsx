import React, { useState, useEffect } from 'react';
import {
  Printer,
  Building2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  PlusCircle,
  RefreshCw,
  Search,
  Filter,
  Lock,
  FileText,
} from 'lucide-react';
import { api } from '../../api';
import { User, Examination } from '../../types';
import { PrintAnywhereRequestModal } from './PrintAnywhereRequestModal';

interface PrintAnywhereTrackingViewProps {
  currentUser: User | null;
  onRefresh?: () => void;
}

export const PrintAnywhereTrackingView: React.FC<PrintAnywhereTrackingViewProps> = ({
  currentUser,
  onRefresh,
}) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Examination | null>(null);

  // Filter State
  const [filterCentre, setFilterCentre] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const loadData = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const [reqRes, examRes] = await Promise.all([
        api.getPrintAnywhereRequests(),
        api.getExaminations().catch(() => ({ examinations: [] })),
      ]);
      setRequests(reqRes.requests || []);
      setExaminations(examRes.examinations || []);
    } catch (err: any) {
      console.error('Error loading Print Anywhere requests:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to load print requests.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreateModal = (exam?: Examination) => {
    if (exam) {
      setSelectedExam(exam);
    } else if (examinations.length > 0) {
      setSelectedExam(examinations[0]);
    } else {
      setSelectedExam({
        id: 'EXAM-GEN-01',
        name: 'General University Examination',
        paper_code: 'UNI-2026',
        subject: 'All Subjects',
        category: 'UNIVERSITY' as any,
        exam_type: 'SEMESTER' as any,
        exam_date: new Date().toISOString().split('T')[0],
        exam_time: '10:00',
        unlock_time: '09:30',
        total_marks: 100,
        total_questions: 20,
        duration_minutes: 180,
        status: 'READY_FOR_GENERATION',
        org_id: 'ORG-ZEROLEAK',
        created_by: currentUser?.id || 'usr-mgr',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    setCreateModalOpen(true);
  };

  const filteredRequests = requests.filter((r) => {
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    if (filterCentre.trim() && !r.centreNumber.toLowerCase().includes(filterCentre.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-white border border-[#E1E7EA] shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px] font-bold uppercase tracking-wider border border-teal-200">
              ZERO-TRUST PRINT RELAY
            </span>
            <span className="text-xs font-mono text-[#61747E]">PRINT ANYWHERE ROUTING &amp; DISPATCH</span>
          </div>
          <h2 className="text-lg font-bold text-[#102A38] mt-1">
            Print Anywhere Fleet Dispatch &amp; Tracking
          </h2>
          <p className="text-xs text-[#61747E] max-w-2xl mt-0.5">
            Pre-authorize print jobs for designated exam centres and certified printer devices with scheduled cryptographic time locks and copy quota enforcement.
          </p>
        </div>

        <button
          onClick={() => handleOpenCreateModal()}
          className="px-4 py-2.5 bg-[#00A878] hover:bg-[#008A63] text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Print Anywhere Dispatch</span>
        </button>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Dispatched Requests Table */}
      <div className="p-6 rounded-2xl bg-white border border-[#E1E7EA] shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E1E7EA] pb-3">
          <div>
            <h3 className="text-sm font-bold text-[#102A38]">Dispatched Print Requests ({requests.length})</h3>
            <p className="text-xs text-[#61747E]">Centres cannot release physical copies before scheduled unlock time.</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search centre..."
              value={filterCentre}
              onChange={(e) => setFilterCentre(e.target.value)}
              className="text-xs px-2.5 py-1.5 border border-[#DCE4E8] rounded-lg bg-white text-[#102A38]"
            />

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs px-2.5 py-1.5 border border-[#DCE4E8] rounded-lg bg-white text-[#102A38]"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_UNLOCK">Pending Unlock</option>
              <option value="UNLOCKED">Unlocked</option>
              <option value="PRINTED">Printed &amp; Completed</option>
              <option value="BLOCKED">Blocked</option>
            </select>

            <button
              onClick={loadData}
              className="p-1.5 border border-[#DCE4E8] text-[#61747E] hover:text-[#102A38] rounded-lg hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#61747E]">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#00A878]" />
            Loading print requests...
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-8 text-center bg-[#F8FAFB] rounded-xl border border-dashed border-[#DCE4E8]">
            <Printer className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <h4 className="text-xs font-bold text-[#102A38]">No Print Anywhere Requests Found</h4>
            <p className="text-[11px] text-[#61747E] mt-1 max-w-sm mx-auto">
              Create a new print request to dispatch examination papers to remote verified examination centres.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFB] text-[#61747E] font-mono text-[10px] uppercase border-y border-[#E1E7EA]">
                <tr>
                  <th className="py-2.5 px-3">Request Number</th>
                  <th className="py-2.5 px-3">Exam / Paper</th>
                  <th className="py-2.5 px-3">Centre &amp; Printer</th>
                  <th className="py-2.5 px-3">Copies</th>
                  <th className="py-2.5 px-3">Scheduled Unlock</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Requested At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1E7EA]">
                {filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-[#F8FAFB] transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-[#102A38]">
                      {req.requestNumber || req.id}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-[#102A38]">{req.examName || req.examId}</div>
                      <div className="text-[10px] text-[#61747E] font-mono">Paper: {req.paperId}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-[#102A38] flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-500" />
                        <span>{req.centreNumber}</span>
                      </div>
                      <div className="text-[10px] text-[#61747E] font-mono">{req.printerName || req.printerId}</div>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-800">
                      {req.requestedCopies}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono text-[11px] text-[#102A38]">
                        {req.scheduledUnlockTime} ({req.scheduledDate})
                      </div>
                      <div className="text-[10px] font-mono font-bold text-teal-700">
                        {req.isTimeUnlocked ? 'Time Unlocked' : 'Time-Locked'}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          req.status === 'PRINTED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : req.status === 'UNLOCKED'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : req.status === 'BLOCKED'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-[10px] font-mono text-[#61747E]">
                      {new Date(req.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dispatch Modal */}
      {createModalOpen && selectedExam && (
        <PrintAnywhereRequestModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          examId={selectedExam.id}
          examName={selectedExam.name}
          examType={selectedExam.category === 'COMPETITIVE' ? 'COMPETITIVE' : 'UNIVERSITY'}
          paperId={selectedExam.current_paper_version_id || `paper-${selectedExam.id}`}
          paperVersion="v1"
          currentUser={currentUser}
          onRequestCreated={() => {
            loadData();
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
};

