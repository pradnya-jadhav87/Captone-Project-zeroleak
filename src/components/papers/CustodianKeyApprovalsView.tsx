import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Award,
  GraduationCap,
  FileText,
  UserCheck,
} from 'lucide-react';
import { api } from '../../api';
import { User, Examination } from '../../types';
import { ThresholdEncryptionAndEmergencyPanel } from './ThresholdEncryptionAndEmergencyPanel';

interface CustodianKeyApprovalsViewProps {
  currentUser: User | null;
  role: 'ORG_OWNER' | 'EXAM_MANAGER' | 'AUDITOR';
  onRefresh?: () => void;
}

export const CustodianKeyApprovalsView: React.FC<CustodianKeyApprovalsViewProps> = ({
  currentUser,
  role,
  onRefresh,
}) => {
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [selectedExam, setSelectedExam] = useState<Examination | null>(null);
  const [selectedExamType, setSelectedExamType] = useState<'UNIVERSITY' | 'COMPETITIVE'>('UNIVERSITY');
  const [loading, setLoading] = useState(true);

  const isCompetitiveExam = (cat?: string) =>
    cat === 'Competitive Exam' || cat === 'NEET' || cat === 'JEE' || cat === 'TCET / CET-type Exam';

  const loadExams = async () => {
    setLoading(true);
    try {
      const res = await api.getExaminations();
      const list = res.examinations || [];
      setExaminations(list);
      if (list.length > 0) {
        if (!selectedExam) {
          setSelectedExam(list[0]);
          setSelectedExamType(isCompetitiveExam(list[0].category) ? 'COMPETITIVE' : 'UNIVERSITY');
        } else {
          const updated = list.find((e) => e.id === selectedExam.id);
          if (updated) setSelectedExam(updated);
        }
      }
    } catch (err: any) {
      console.error('Error loading examinations for custodian approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

  const paperId = selectedExam?.current_paper_version_id || (selectedExam ? selectedExam.id : 'paper-default');

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-white border border-[#E1E7EA] shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider border border-indigo-200">
              SHAMIR 2-OF-3 ENCRYPTED ENCLAVE
            </span>
            <span className="text-xs font-mono text-[#61747E]">CUSTODIAN THRESHOLD KEY PROTOCOL</span>
          </div>
          <h2 className="text-lg font-bold text-[#102A38] mt-1">
            {role === 'ORG_OWNER'
              ? 'Organization Owner — Custodian Key Approvals'
              : role === 'AUDITOR'
              ? 'Security Auditor — Custodian Key Authorization'
              : 'Examination Manager — Paper Encryption & Custodian Status'}
          </h2>
          <p className="text-xs text-[#61747E] max-w-2xl mt-0.5">
            Papers require a minimum of 2 authorized custodian approvals (Owner, Auditor, or Manager) before encryption keys can be combined for release or emergency unlocking.
          </p>
        </div>

        <button
          onClick={loadExams}
          className="p-2 border border-[#DCE4E8] text-[#61747E] hover:text-[#102A38] rounded-xl hover:bg-gray-50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Exam Selector Strip */}
      <div className="p-4 bg-white border border-[#E1E7EA] rounded-2xl shadow-xs space-y-3">
        <span className="text-xs font-bold text-[#102A38] uppercase font-mono block">
          Select Examination Paper to Authorize:
        </span>
        {loading ? (
          <div className="p-4 text-center text-xs text-[#61747E]">Loading active examinations...</div>
        ) : examinations.length === 0 ? (
          <div className="p-4 text-center text-xs text-[#61747E]">No active examination papers configured yet.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {examinations.map((exam) => {
              const isSelected = selectedExam?.id === exam.id;
              const isComp = isCompetitiveExam(exam.category);
              return (
                <button
                  key={exam.id}
                  onClick={() => {
                    setSelectedExam(exam);
                    setSelectedExamType(isComp ? 'COMPETITIVE' : 'UNIVERSITY');
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                    isSelected
                      ? 'bg-[#102A38] text-white border-[#102A38] shadow-sm'
                      : 'bg-[#F8FAFB] hover:bg-gray-100 text-[#334E68] border-[#E1E7EA]'
                  }`}
                >
                  {isComp ? (
                    <Award className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-400' : 'text-amber-600'}`} />
                  ) : (
                    <GraduationCap className={`w-3.5 h-3.5 ${isSelected ? 'text-teal-400' : 'text-teal-600'}`} />
                  )}
                  <span>{exam.name}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
                    {exam.paper_code || exam.id}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Threshold Panel for Selected Exam */}
      {selectedExam && (
        <ThresholdEncryptionAndEmergencyPanel
          examType={selectedExamType}
          paperId={paperId}
          paperVersion="v1"
          examId={selectedExam.id}
          currentUser={currentUser}
          onPaperEncrypted={() => {
            loadExams();
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
};

