import React, { useState, useEffect } from 'react';
import {
  Printer,
  Calendar,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Building2,
  FileText,
  Lock,
} from 'lucide-react';
import { api } from '../../api';
import { User } from '../../types';

interface PrintAnywhereRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  examId: string;
  examName: string;
  examType: 'COMPETITIVE' | 'UNIVERSITY';
  paperId: string;
  paperVersion?: string;
  currentUser: User | null;
  onRequestCreated?: (request: any) => void;
}

export const PrintAnywhereRequestModal: React.FC<PrintAnywhereRequestModalProps> = ({
  isOpen,
  onClose,
  examId,
  examName,
  examType,
  paperId,
  paperVersion = 'v1',
  currentUser,
  onRequestCreated,
}) => {
  const [centreNumber, setCentreNumber] = useState('CTR-101');
  const [printers, setPrinters] = useState<any[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState('');
  const [requestedCopies, setRequestedCopies] = useState(25);
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [scheduledUnlockTime, setScheduledUnlockTime] = useState('10:00 AM');
  const [loading, setLoading] = useState(false);
  const [fetchingPrinters, setFetchingPrinters] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success' | 'warn'; text: string } | null>(null);

  // Load registered printers for selected centre
  useEffect(() => {
    if (!isOpen) return;
    const loadPrinters = async () => {
      setFetchingPrinters(true);
      try {
        const res = await api.getRegisteredPrinters(centreNumber, examType, false);
        setPrinters(res.printers || []);
        const defaultOnline = res.printers.find((p: any) => p.status === 'ONLINE' && p.isActive);
        if (defaultOnline) {
          setSelectedPrinterId(defaultOnline.id);
        } else if (res.printers.length > 0) {
          setSelectedPrinterId(res.printers[0].id);
        }
      } catch (err) {
        console.warn('Could not load printers:', err);
      } finally {
        setFetchingPrinters(false);
      }
    };
    loadPrinters();
  }, [isOpen, centreNumber, examType]);

  const selectedPrinter = printers.find(p => p.id === selectedPrinterId);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPrinterId) {
      setStatusMessage({ type: 'error', text: 'Please select a destination printer.' });
      return;
    }

    if (selectedPrinter && selectedPrinter.status !== 'ONLINE') {
      setStatusMessage({ type: 'error', text: `Selected printer "${selectedPrinter.name}" is OFFLINE.` });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const res = await api.createPrintAnywhereRequest({
        examId,
        examName,
        examType,
        paperId,
        paperVersion,
        centreNumber,
        printerId: selectedPrinterId,
        requestedCopies: Number(requestedCopies),
        scheduledUnlockTime,
        scheduledDate,
        idempotencyKey: `req-${examId}-${paperId}-${centreNumber}-${Date.now()}`,
      });

      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Print request ${res.request?.requestNumber} successfully scheduled for Centre ${centreNumber}. Status: ${res.request?.status}.`,
        });
        if (onRequestCreated) {
          onRequestCreated(res.request);
        }
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Failed to create print request.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error creating print request.' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Print Anywhere Request Dispatch</h3>
              <p className="text-[11px] text-slate-300 font-mono">
                Examination Manager → Centre Superintendent &amp; Operator
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Target Paper Info */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400">Target Paper</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 font-mono text-[10px] font-bold">
                {examType} • Version {paperVersion}
              </span>
            </div>
            <p className="font-semibold text-slate-800 line-clamp-1">{examName}</p>
          </div>

          {/* Status Message Banner */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                statusMessage.type === 'error'
                  ? 'bg-rose-50 text-rose-900 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              }`}
            >
              {statusMessage.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <span className="flex-1 font-medium">{statusMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleSubmitRequest} className="space-y-4">
            {/* Destination Centre */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Destination Examination Centre *</span>
              </label>
              <select
                value={centreNumber}
                onChange={e => setCentreNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="CTR-101">CTR-101 — Solapur Central Examination Centre</option>
                <option value="CTR-102">CTR-102 — Pune Regional Examination Enclave</option>
                <option value="CTR-103">CTR-103 — Mumbai Confidential Centre</option>
              </select>
            </div>

            {/* Destination Printer (Validated Registry) */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 justify-between">
                <div className="flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Validated Hardware Printer Registry *</span>
                </div>
                {fetchingPrinters && <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />}
              </label>
              <select
                value={selectedPrinterId}
                onChange={e => setSelectedPrinterId(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {printers.map(p => (
                  <option key={p.id} value={p.id} disabled={p.status !== 'ONLINE'}>
                    {p.name} [{p.status}] — {p.location} (Max {p.maxCopiesLimit} copies)
                  </option>
                ))}
              </select>
              {selectedPrinter && (
                <div className="text-[10px] text-slate-500 flex items-center justify-between pt-0.5 px-1 font-mono">
                  <span>Location: {selectedPrinter.location}</span>
                  <span className={selectedPrinter.status === 'ONLINE' ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                    ● {selectedPrinter.status}
                  </span>
                </div>
              )}
            </div>

            {/* Authorized Copies & Unlock Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Authorized Copies *</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedPrinter?.maxCopiesLimit || 500}
                  value={requestedCopies}
                  onChange={e => setRequestedCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Unlock Time *</span>
                </label>
                <input
                  type="text"
                  value={scheduledUnlockTime}
                  onChange={e => setScheduledUnlockTime(e.target.value)}
                  placeholder="e.g. 10:00 AM"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Scheduled Date */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>Scheduled Examination Date *</span>
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !selectedPrinterId}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
              >
                {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Make Print Request</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

