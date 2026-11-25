import React, { useState } from 'react';
import {
  Search,
  ShieldCheck,
  ShieldAlert,
  Printer,
  Building2,
  Clock,
  UserCheck,
  FileText,
  Hash,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { api } from '../../api';

export const AuditorLeakInvestigationPanel: React.FC = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<{
    found: boolean;
    match?: any;
    custodyTimeline?: any[];
  } | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const res = await api.investigateWatermark(query.trim());
      setResult(res);
    } catch (err: any) {
      setResult({ found: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 text-[10px] font-bold uppercase tracking-wider">
            Chief Vigilance &amp; Security Forensics
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono text-[10px]">
            Anti-Leak Watermark Origin Trace
          </span>
        </div>
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mt-1">
          <ShieldAlert className="w-5 h-5 text-rose-600" />
          <span>Paper Leak Investigation &amp; Copy Identifier Forensics</span>
        </h3>
        <p className="text-xs text-slate-500">
          Enter a photographed watermark snippet, Copy Identifier (e.g. CPY-CTR101-...), or printer stamp text to resolve the originating centre, printer, operator, and audit custody trail.
        </p>
      </div>

      {/* Search Input */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by Copy ID (e.g. CPY-CTR101-01), Centre No, Printer No, or partial watermark..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          <span>Investigate Stamp</span>
        </button>
      </form>

      {/* Quick Search Badges */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="text-[11px] font-medium">Quick Test:</span>
        <button
          type="button"
          onClick={() => { setQuery('CTR-101'); }}
          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] transition-colors"
        >
          Centre CTR-101
        </button>
        <button
          type="button"
          onClick={() => { setQuery('CPY-CTR101'); }}
          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] transition-colors"
        >
          Copy Prefix CPY-CTR101
        </button>
      </div>

      {/* Search Results */}
      {searched && (
        <div className="pt-2 border-t border-slate-100">
          {result?.found && result.match ? (
            <div className="space-y-4">
              {/* Positive Identification Banner */}
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-600 text-white shrink-0 mt-0.5">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">
                      Positive Forensic Match Identified
                    </span>
                    <h4 className="text-sm font-bold text-emerald-950 font-mono">
                      Copy Identifier: {result.match.copyIdentifier}
                    </h4>
                    <p className="text-xs text-emerald-800 font-medium">
                      Exact physical sheet accounted for in ZeroLeak serialized distribution ledger.
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-200 text-emerald-900 text-[10px] font-bold">
                  Copy #{result.match.copyNumber} of {result.match.totalCopies}
                </span>
              </div>

              {/* Forensic Breakdown Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* Examination & Paper Reference */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Examination Details
                  </span>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Exam Title:</span>
                      <span className="font-bold text-slate-900 text-right">{result.match.examName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Exam Type:</span>
                      <span className="font-mono font-semibold text-slate-800">{result.match.examType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Paper Version:</span>
                      <span className="font-mono font-semibold text-indigo-600">{result.match.paperVersion}</span>
                    </div>
                  </div>
                </div>

                {/* Origin Centre & Physical Hardware Printer */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Origin Hardware Location
                  </span>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Centre Code:</span>
                      <span className="font-bold text-slate-900 font-mono">{result.match.centreNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Assigned Printer:</span>
                      <span className="font-semibold text-slate-800">{result.match.printerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Printer ID:</span>
                      <span className="font-mono text-slate-600">{result.match.printerId}</span>
                    </div>
                  </div>
                </div>

                {/* Operator Custody & Print Timestamp */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Printing Operator Custody
                  </span>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Operator:</span>
                      <span className="font-bold text-slate-900">{result.match.operatorName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Operator ID:</span>
                      <span className="font-mono text-slate-600">{result.match.operatorId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Print Timestamp:</span>
                      <span className="font-mono text-slate-800">
                        {new Date(result.match.printedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Security Verification Hash */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Cryptographic Hash &amp; Watermark
                  </span>
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-slate-500 block text-[10px]">SHA-256 Custody Hash:</span>
                      <span className="font-mono text-[10px] text-slate-700 break-all select-all block bg-white p-1 rounded border border-slate-200">
                        {result.match.securityHash}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Stamped Banner:</span>
                      <span className="font-mono text-[9px] text-slate-600 break-all block bg-white p-1 rounded border border-slate-200">
                        {result.match.watermarkText}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Custody Timeline */}
              {result.custodyTimeline && result.custodyTimeline.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <span className="text-xs font-bold text-slate-800 block">
                    Chain-of-Custody Timeline
                  </span>
                  <div className="space-y-3">
                    {result.custodyTimeline.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-xs">
                        <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                          {idx + 1}
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{item.stage}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(item.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-slate-600 text-[11px]">{item.details}</p>
                          <span className="text-[10px] text-slate-500 font-medium">Actor: {item.actor}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
              <h4 className="text-sm font-bold text-slate-800">No Matching Watermark Found</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No physical printout records matched &quot;{query}&quot;. Verify the Copy ID, Centre Code, or Printer reference entered.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

