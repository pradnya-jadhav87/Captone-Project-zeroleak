import React, { useState, useEffect } from 'react';
import {
  AlertOctagon,
  ShieldAlert,
  Flame,
  CheckCircle2,
  Lock,
  RotateCcw,
  Layers,
  FileText,
  Search,
  Filter,
  ArrowRight,
  Eye,
  KeyRound,
  Printer,
  Ban,
  Clock,
  RefreshCw,
  PlusCircle,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../../api';
import { User, Examination } from '../../types';
import { PaperLeakResponseWizardModal } from './PaperLeakResponseWizardModal';

interface PaperLeakManagementViewProps {
  currentUser: User | null;
  role: 'ORG_OWNER' | 'EXAM_MANAGER' | 'AUDITOR';
  onRefresh?: () => void;
}

export const PaperLeakManagementView: React.FC<PaperLeakManagementViewProps> = ({
  currentUser,
  role,
  onRefresh,
}) => {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Wizard modal state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTargetExam, setWizardTargetExam] = useState<any | null>(null);

  // Details modal state
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [incidentDetails, setIncidentDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Filter state
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const loadData = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const [incRes, examRes] = await Promise.all([
        api.listPaperLeakIncidents().catch(() => ({ incidents: [] })),
        api.getExaminations().catch(() => ({ examinations: [] })),
      ]);
      setIncidents(incRes.incidents || []);
      setExaminations(examRes.examinations || []);
    } catch (err: any) {
      console.error('Error loading leak data:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to load leak incidents.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenWizard = (exam?: any) => {
    if (exam) {
      setWizardTargetExam(exam);
    } else if (examinations.length > 0) {
      setWizardTargetExam(examinations[0]);
    } else {
      setWizardTargetExam({
        id: 'EXAM-FALLBACK-01',
        name: 'University Final Examination',
        paper_code: 'ENG-CS-401',
        subject: 'Computer Science & Engineering',
        total_marks: 100,
        current_paper_version_id: 'paper-v1',
      });
    }
    setWizardOpen(true);
  };

  const handleViewIncidentDetails = async (incident: any) => {
    setSelectedIncident(incident);
    setLoadingDetails(true);
    try {
      const res = await api.getPaperLeakIncident(incident.id);
      setIncidentDetails(res);
    } catch (err: any) {
      console.error('Error fetching incident details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleApproveReplacement = async (replacementPaperId: string) => {
    try {
      const res = await api.approveAndEncryptReplacementPaper({
        replacementPaperId,
        approvalReason: `Formal release approved by ${currentUser?.role || 'Authority'} (${currentUser?.full_name || currentUser?.id})`,
      });
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: 'Replacement paper approved and threshold-encrypted successfully! Distributed to print workflow.',
        });
        await loadData();
        if (selectedIncident) {
          handleViewIncidentDetails(selectedIncident);
        }
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Approval failed.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to approve replacement.' });
    }
  };

  const filteredIncidents = incidents.filter((inc) => {
    if (filterSeverity !== 'ALL' && inc.severity !== filterSeverity) return false;
    if (filterStatus !== 'ALL' && inc.leakStatus !== filterStatus) return false;
    return true;
  });

  const containedCount = incidents.filter((i) => i.paperStatus === 'CONTAINED' || i.leakStatus === 'CONTAINED').length;
  const replacedCount = incidents.filter((i) => i.replacementPaperId).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Bar */}
      <div className="p-6 rounded-2xl bg-white border border-[#E1E7EA] shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold uppercase tracking-wider border border-rose-200">
              ANTI-LEAK PROTOCOL
            </span>
            <span className="text-xs font-mono text-[#61747E]">EMERGENCY QUARANTINE &amp; REGENERATION</span>
          </div>
          <h2 className="text-lg font-bold text-[#102A38] mt-1">
            {role === 'ORG_OWNER'
              ? 'Paper Leak & Quarantine Oversight'
              : role === 'AUDITOR'
              ? 'Paper Leak Forensic Incidents Registry'
              : 'Paper Leak Response & Emergency Regeneration'}
          </h2>
          <p className="text-xs text-[#61747E] max-w-2xl mt-0.5">
            Quarantine compromised questions and source drafts without discarding unaffected questions. Generate new paper combinations and route replacements to secure print centers.
          </p>
        </div>

        {role !== 'AUDITOR' && (
          <button
            onClick={() => handleOpenWizard()}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer"
          >
            <AlertOctagon className="w-4 h-4" />
            <span>Report Paper Leak / Regenerate</span>
          </button>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-[#E1E7EA] shadow-xs">
          <span className="text-[10px] font-mono font-bold text-[#61747E] uppercase block">Total Incidents</span>
          <span className="text-2xl font-mono font-black text-[#102A38]">{incidents.length}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">Logged in secure ledger</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#E1E7EA] shadow-xs">
          <span className="text-[10px] font-mono font-bold text-[#61747E] uppercase block">Contained Papers</span>
          <span className="text-2xl font-mono font-black text-rose-600">{containedCount}</span>
          <span className="text-[10px] text-rose-500 font-semibold block mt-0.5">Printing Suspended</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#E1E7EA] shadow-xs">
          <span className="text-[10px] font-mono font-bold text-[#61747E] uppercase block">Regenerated Papers</span>
          <span className="text-2xl font-mono font-black text-emerald-600">{replacedCount}</span>
          <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">Replacement Versions Released</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#E1E7EA] shadow-xs">
          <span className="text-[10px] font-mono font-bold text-[#61747E] uppercase block">Active Exams Ready</span>
          <span className="text-2xl font-mono font-black text-[#2672B8]">{examinations.length}</span>
          <span className="text-[10px] text-[#2672B8] font-semibold block mt-0.5">Eligible for Emergency Action</span>
        </div>
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

      {/* Incidents Table */}
      <div className="p-6 rounded-2xl bg-white border border-[#E1E7EA] shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E1E7EA] pb-3">
          <div>
            <h3 className="text-sm font-bold text-[#102A38]">Formal Leak Incidents &amp; Replacement Ledger</h3>
            <p className="text-xs text-[#61747E]">All reported leaks trigger immediate paper suspension and question quarantine.</p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="text-xs px-2.5 py-1.5 border border-[#DCE4E8] rounded-lg bg-white text-[#102A38]"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
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
            Loading incidents...
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="p-8 text-center bg-[#F8FAFB] rounded-xl border border-dashed border-[#DCE4E8]">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <h4 className="text-xs font-bold text-[#102A38]">No Compromised Papers Recorded</h4>
            <p className="text-[11px] text-[#61747E] mt-1 max-w-sm mx-auto">
              All paper generation cycles and question pools are currently intact and verified.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFB] text-[#61747E] font-mono text-[10px] uppercase border-y border-[#E1E7EA]">
                <tr>
                  <th className="py-2.5 px-3">Incident ID</th>
                  <th className="py-2.5 px-3">Exam / Paper</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Paper Status</th>
                  <th className="py-2.5 px-3">Reported By</th>
                  <th className="py-2.5 px-3">Replacement</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E1E7EA]">
                {filteredIncidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-[#F8FAFB] transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-[#102A38]">
                      {inc.incidentNumber || inc.id}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-[#102A38]">{inc.examId}</div>
                      <div className="text-[10px] text-[#61747E] font-mono">Paper: {inc.paperId} ({inc.paperVersion})</div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          inc.severity === 'CRITICAL'
                            ? 'bg-rose-100 text-rose-800'
                            : inc.severity === 'HIGH'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {inc.severity}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          inc.paperStatus === 'CONTAINED'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : inc.paperStatus === 'REPLACED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {inc.paperStatus}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[#61747E]">
                      <div>{inc.reportedByName || inc.reportedById}</div>
                      <div className="text-[10px] font-mono">{new Date(inc.createdAt || inc.discoveryTimestamp).toLocaleDateString()}</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-xs">
                      {inc.replacementPaperId ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          {inc.replacementPaperVersion || inc.replacementPaperId}
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold text-[11px]">Pending Regeneration</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => handleViewIncidentDetails(inc)}
                        className="px-3 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#1E293B] rounded-lg text-xs font-semibold transition-colors"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Active Examinations Quick Trigger Section (For Manager) */}
      {role === 'EXAM_MANAGER' && examinations.length > 0 && (
        <div className="p-6 rounded-2xl bg-white border border-[#E1E7EA] shadow-xs space-y-4">
          <div className="border-b border-[#E1E7EA] pb-3">
            <h3 className="text-sm font-bold text-[#102A38]">Active Examinations Quick Leak Response</h3>
            <p className="text-xs text-[#61747E]">Select an exam to immediately initiate containment and regeneration.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {examinations.map((exam) => (
              <div
                key={exam.id}
                className="p-4 rounded-xl bg-[#F8FAFB] border border-[#E1E7EA] hover:border-rose-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-bold text-[#008A63] uppercase">
                      {exam.category || 'EXAMINATION'}
                    </span>
                    <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-[#E1E7EA] text-[#61747E] font-mono">
                      {exam.paper_code || exam.id}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-[#102A38] mt-1.5 line-clamp-1">{exam.name}</h4>
                  <p className="text-[11px] text-[#61747E] mt-0.5">{exam.subject} • {exam.total_marks} Marks</p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#E1E7EA] flex items-center justify-between">
                  <span className="text-[10px] font-mono text-[#61747E]">
                    Paper: {exam.current_paper_version_id || 'v1'}
                  </span>
                  <button
                    onClick={() => handleOpenWizard(exam)}
                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <Flame className="w-3 h-3 text-rose-600" />
                    <span>Report Leak</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incident Details Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 bg-[#0F2231] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-rose-400" />
                <h3 className="text-base font-bold text-white">
                  Incident Review: {selectedIncident.incidentNumber || selectedIncident.id}
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedIncident(null);
                  setIncidentDetails(null);
                }}
                className="p-1 text-gray-400 hover:text-white rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {loadingDetails ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#00A878]" />
                  Loading incident details...
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-gray-50 rounded-xl border">
                      <span className="text-gray-500 text-[10px] uppercase font-mono block">Exam ID</span>
                      <span className="font-bold text-gray-900">{selectedIncident.examId}</span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border">
                      <span className="text-gray-500 text-[10px] uppercase font-mono block">Paper Version</span>
                      <span className="font-bold text-gray-900">{selectedIncident.paperVersion || 'v1'}</span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border">
                      <span className="text-gray-500 text-[10px] uppercase font-mono block">Severity</span>
                      <span className="font-bold text-rose-600">{selectedIncident.severity}</span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border">
                      <span className="text-gray-500 text-[10px] uppercase font-mono block">Status</span>
                      <span className="font-bold text-gray-900">{selectedIncident.paperStatus}</span>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-xl border space-y-1">
                    <span className="text-xs font-bold text-gray-700 block">Incident Description</span>
                    <p className="text-xs text-gray-600 leading-relaxed">{selectedIncident.description}</p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      Reason for Regeneration: <span className="font-semibold text-gray-800">{selectedIncident.regenerationReason}</span>
                    </p>
                  </div>

                  {/* Quarantined Questions List */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-900 uppercase font-mono">
                      Quarantined Questions &amp; Pools ({incidentDetails?.quarantines?.length || 0})
                    </h4>
                    {incidentDetails?.quarantines && incidentDetails.quarantines.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {incidentDetails.quarantines.map((q: any) => (
                          <div key={q.id} className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs flex items-center justify-between">
                            <div>
                              <span className="font-bold text-rose-900 font-mono">
                                [{q.quarantine_scope}] {q.target_name || q.target_id}
                              </span>
                              <p className="text-[11px] text-rose-700 mt-0.5">{q.quarantine_reason}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-800 text-[10px] font-bold">
                              {q.review_status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No specific questions individually quarantined.</p>
                    )}
                  </div>

                  {/* Replacement Paper Details */}
                  {incidentDetails?.replacementPaper && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Replacement Paper Generated: {incidentDetails.replacementPaper.replacementPaperVersion}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">
                          {incidentDetails.replacementPaper.approvalStatus}
                        </span>
                      </div>
                      <p className="text-xs text-emerald-800">
                        Total Marks: {incidentDetails.replacementPaper.totalMarks} • Total Questions: {incidentDetails.replacementPaper.totalQuestions}
                      </p>

                      {incidentDetails.replacementPaper.approvalStatus === 'PENDING_APPROVAL' && (role === 'ORG_OWNER' || role === 'EXAM_MANAGER') && (
                        <button
                          onClick={() => handleApproveReplacement(incidentDetails.replacementPaper.id)}
                          className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          Approve &amp; Threshold Encrypt Replacement Paper
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  setSelectedIncident(null);
                  setIncidentDetails(null);
                }}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guided Leak Wizard Modal */}
      {wizardOpen && wizardTargetExam && (
        <PaperLeakResponseWizardModal
          isOpen={wizardOpen}
          onClose={() => setWizardOpen(false)}
          exam={wizardTargetExam}
          currentUser={currentUser}
          onRegenerationSuccess={() => {
            loadData();
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
};

