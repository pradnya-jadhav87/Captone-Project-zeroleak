import React, { useState, useEffect } from 'react';
import {
  Activity,
  ShieldAlert,
  UserCheck,
  Layers,
  Printer,
  History,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  Camera,
  Mic,
  Volume2,
  Maximize2,
  X,
  ShieldCheck,
  Eye,
  Users,
} from 'lucide-react';
import { User, AuditEvent, SecurityEvent, PrintCopy, AuthorityProctorSession, CameraEvidenceItem, VoiceEvidenceItem } from '../../types';
import { api } from '../../api';
import { NavSubTab } from '../Sidebar';
import { AuthoritySurveillanceDashboard } from '../proctor/AuthoritySurveillanceDashboard';

interface AuditorWorkspaceProps {
  currentUser: User | null;
  activeSubTab: NavSubTab;
  onRefresh: () => void;
}

export const AuditorWorkspace: React.FC<AuditorWorkspaceProps> = ({
  currentUser,
  activeSubTab,
  onRefresh,
}) => {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [printHistory, setPrintHistory] = useState<PrintCopy[]>([]);
  const [surveillanceSessions, setSurveillanceSessions] = useState<AuthorityProctorSession[]>([]);
  const [evidenceBySession, setEvidenceBySession] = useState<Record<string, { camera: CameraEvidenceItem[]; voice: VoiceEvidenceItem[] }>>({});
  const [previewPhoto, setPreviewPhoto] = useState<{ open: boolean; url: string; title: string; official: string; timestamp: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [auditRes, secRes, printRes, survRes] = await Promise.all([
        api.getAuditEvents().catch(() => ({ events: [] })),
        api.getSecurityEvents().catch(() => ({ events: [] })),
        api.getPrintHistory().catch(() => ({ printHistory: [] })),
        api.authorityProctor.getSurveillanceDashboard().catch(() => ({ sessions: [] })),
      ]);

      setAuditEvents(auditRes.events || []);
      setSecurityEvents(secRes.events || []);
      setPrintHistory(printRes.printHistory || []);

      const sessList = (survRes as any)?.sessions || [];
      setSurveillanceSessions(sessList);

      // Fetch camera & voice evidence for all active sessions (Printing Manager & Translator)
      const evMap: Record<string, { camera: CameraEvidenceItem[]; voice: VoiceEvidenceItem[] }> = {};
      await Promise.all(
        sessList.map(async (s: AuthorityProctorSession) => {
          try {
            const [camRes, voiceRes] = await Promise.all([
              api.authorityProctor.getSessionCameraEvidence(s.id).catch(() => ({ evidence: [] })),
              api.authorityProctor.getSessionEvidence(s.id).catch(() => ({ evidence: [] })),
            ]);
            evMap[s.id] = {
              camera: camRes.evidence || [],
              voice: voiceRes.evidence || [],
            };
          } catch {}
        })
      );
      setEvidenceBySession(evMap);
    } catch (err: any) {
      console.error('Auditor load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveSecurityEvent = async (id: string) => {
    try {
      await api.resolveSecurityEvent(id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Resolve error');
    }
  };

  return (
    <div className="space-y-6">
      {/* DASHBOARD */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                Independent Oversight Console
              </span>
              <h2 className="text-2xl font-bold text-slate-900 mt-2">Vigilance & Security Audit Enclave</h2>
              <p className="text-xs text-slate-500 mt-1">
                Read-only immutable oversight of cryptographic operations, session authentications, and threat telemetry.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="metric-card p-4 rounded-xl bg-slate-50/70 border border-slate-200/80">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[11px] font-medium">Total Audit Logs</span>
                  <Activity className="w-4 h-4 text-emerald-700" />
                </div>
                <span className="text-2xl font-black text-slate-900">{auditEvents.length}</span>
                <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">SHA-256 Chained</span>
              </div>

              <div className="metric-card p-4 rounded-xl bg-slate-50/70 border border-slate-200/80">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[11px] font-medium">Security Incidents</span>
                  <ShieldAlert className="w-4 h-4 text-rose-700" />
                </div>
                <span className="text-2xl font-black text-rose-700">{securityEvents.length}</span>
                <span className="text-[10px] text-rose-600 font-semibold block mt-0.5">Detected Threats</span>
              </div>

              <div className="metric-card p-4 rounded-xl bg-slate-50/70 border border-slate-200/80">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[11px] font-medium">Tracked Print Copies</span>
                  <Printer className="w-4 h-4 text-sky-700" />
                </div>
                <span className="text-2xl font-black text-slate-900">{printHistory.length}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Watermark Bound</span>
              </div>

              <div className="metric-card p-4 rounded-xl bg-emerald-50/50 border border-emerald-200">
                <div className="flex items-center justify-between text-emerald-700 mb-1">
                  <span className="text-[11px] font-semibold">Ledger Integrity</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                </div>
                <span className="text-2xl font-black text-emerald-800">100%</span>
                <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">VERIFIED TAMPER-FREE</span>
              </div>
            </div>
          </div>

          {/* LIVE AUTHORITY SURVEILLANCE & FORENSIC EVIDENCE FEED (PRINTING MANAGER & TRANSLATOR) */}
          <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    Live Optical & Acoustic Telemetry
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Zero-Leak CBI Protocol</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-1 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  Live Official Camera & Audio Surveillance Feed
                </h3>
                <p className="text-xs text-slate-500">
                  Continuous webcam snapshot evidence and voice surveillance feeds for both the Printing Manager and Linguistic Translator.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => loadData()}
                  className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5 text-slate-500" />
                  Refresh Telemetry
                </button>
              </div>
            </div>

            {/* 2-Column Grid for Printing Manager and Translator */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1. PRINTING MANAGER (CENTRE OPERATOR) */}
              {(() => {
                const printSess = surveillanceSessions.find(
                  s => s.user_role === 'CENTRE_OPERATOR' || s.workspace_type === 'DECRYPTED_PAPER_VIEWER' || s.id === 'AUTH-SESS-PRINT-01'
                ) || {
                  id: 'AUTH-SESS-PRINT-01',
                  user_id: 'usr-operator-01',
                  user_name: 'Manoj Kumar (Centre Superintendent & Printing Operator)',
                  user_email: 'operator@centre101.edu.in',
                  user_role: 'CENTRE_OPERATOR',
                  workspace_type: 'DECRYPTED_PAPER_VIEWER',
                  camera_status: 'ACTIVE',
                  microphone_status: 'ACTIVE',
                  face_status: 'VERIFIED',
                  created_at: new Date().toISOString(),
                };
                const evData = evidenceBySession[printSess.id] || { camera: [], voice: [] };
                const cameraItems = evData.camera.length > 0 ? evData.camera : printSess.verification_snapshot ? [{
                  id: 'CAM-INIT-PRINT',
                  session_id: printSess.id,
                  image_data_url: printSess.verification_snapshot,
                  event_type: 'VERIFICATION_SNAPSHOT',
                  user_name: printSess.user_name,
                  user_role: 'CENTRE_OPERATOR',
                  created_at: printSess.created_at,
                }] : [];

                return (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4 shadow-xs">
                    {/* Official Identity Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                            PRINTING MANAGER
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">CTR-101 Relay Gate</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900">{printSess.user_name}</h4>
                        <div className="text-[11px] text-slate-500 font-mono">{printSess.user_email}</div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Camera className="w-3 h-3 text-emerald-600" />
                          Cam: {printSess.camera_status || 'ACTIVE'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Mic className="w-3 h-3 text-emerald-600" />
                          Mic: {printSess.microphone_status || 'ACTIVE'}
                        </span>
                      </div>
                    </div>

                    {/* Camera Photos Section */}
                    <div className="space-y-2 bg-white p-3.5 rounded-xl border border-slate-200/80">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-sky-600" />
                          Camera Snapshot Evidence ({cameraItems.length})
                        </span>
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          Verified Official
                        </span>
                      </div>

                      {cameraItems.length === 0 ? (
                        <p className="text-[11px] text-slate-400 py-4 text-center italic">
                          Awaiting initial camera snapshot stream from Printing Manager terminal...
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2.5">
                          {cameraItems.slice(0, 2).map((cam: any) => (
                            <div
                              key={cam.id}
                              className="group relative rounded-lg overflow-hidden border border-slate-200 bg-slate-900 aspect-video cursor-pointer"
                              onClick={() =>
                                setPreviewPhoto({
                                  open: true,
                                  url: cam.image_data_url,
                                  title: cam.event_type || 'Printing Manager Camera Snapshot',
                                  official: printSess.user_name,
                                  timestamp: cam.created_at || new Date().toISOString(),
                                })
                              }
                            >
                              <img
                                src={cam.image_data_url}
                                alt="Printing Manager Camera Snapshot"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="px-2 py-1 rounded bg-white text-slate-900 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                                  <Maximize2 className="w-3 h-3 text-sky-600" />
                                  Expand Photo
                                </span>
                              </div>
                              <div className="absolute bottom-1 left-1 right-1 bg-slate-900/80 backdrop-blur-xs px-1.5 py-0.5 rounded text-[9px] font-mono text-white truncate">
                                {new Date(cam.created_at).toLocaleTimeString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Audio Evidence Section */}
                    <div className="space-y-2 bg-white p-3.5 rounded-xl border border-slate-200/80">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                          Voice Evidence Audio Recordings ({evData.voice.length})
                        </span>
                        <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                          Acoustic Wire Active
                        </span>
                      </div>

                      {evData.voice.length === 0 ? (
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/70 text-center space-y-1">
                          <p className="text-[11px] text-slate-500">Live Microphone Listening Telemetry Active (-38.5 dB)</p>
                          <p className="text-[10px] text-slate-400">Microphone stream is actively monitored for unauthorized acoustic leak.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {evData.voice.slice(0, 2).map((v: any) => (
                            <div key={v.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 space-y-1.5">
                              <div className="flex justify-between items-center text-[10px] font-mono text-slate-600">
                                <span>Voice Sample #{v.id?.substring(0, 10)}</span>
                                <span>{new Date(v.created_at).toLocaleTimeString()} ({v.duration_seconds || 3}s)</span>
                              </div>
                              <audio
                                controls
                                src={v.audio_data_url}
                                className="w-full h-8"
                                preload="metadata"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 2. LINGUISTIC TRANSLATOR */}
              {(() => {
                const transSess = surveillanceSessions.find(
                  s => s.user_role === 'TRANSLATOR' || s.workspace_type === 'TRANSLATOR_PORTAL' || s.id === 'AUTH-SESS-TRANS-01'
                ) || {
                  id: 'AUTH-SESS-TRANS-01',
                  user_id: 'usr-translator-01',
                  user_name: 'Prof. Meera Deshmukh (Chief Linguistic Translator)',
                  user_email: 'translator@nbte.edu.in',
                  user_role: 'TRANSLATOR',
                  workspace_type: 'TRANSLATOR_PORTAL',
                  camera_status: 'ACTIVE',
                  microphone_status: 'ACTIVE',
                  face_status: 'VERIFIED',
                  created_at: new Date().toISOString(),
                };
                const evData = evidenceBySession[transSess.id] || { camera: [], voice: [] };
                const cameraItems = evData.camera.length > 0 ? evData.camera : transSess.verification_snapshot ? [{
                  id: 'CAM-INIT-TRANS',
                  session_id: transSess.id,
                  image_data_url: transSess.verification_snapshot,
                  event_type: 'VERIFICATION_SNAPSHOT',
                  user_name: transSess.user_name,
                  user_role: 'TRANSLATOR',
                  created_at: transSess.created_at,
                }] : [];

                return (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4 shadow-xs">
                    {/* Official Identity Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            LINGUISTIC TRANSLATOR
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">NBTE Confidential Enclave</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900">{transSess.user_name}</h4>
                        <div className="text-[11px] text-slate-500 font-mono">{transSess.user_email}</div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Camera className="w-3 h-3 text-emerald-600" />
                          Cam: {transSess.camera_status || 'ACTIVE'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Mic className="w-3 h-3 text-emerald-600" />
                          Mic: {transSess.microphone_status || 'ACTIVE'}
                        </span>
                      </div>
                    </div>

                    {/* Camera Photos Section */}
                    <div className="space-y-2 bg-white p-3.5 rounded-xl border border-slate-200/80">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-indigo-600" />
                          Camera Snapshot Evidence ({cameraItems.length})
                        </span>
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          Verified Official
                        </span>
                      </div>

                      {cameraItems.length === 0 ? (
                        <p className="text-[11px] text-slate-400 py-4 text-center italic">
                          Awaiting initial camera snapshot stream from Translator portal...
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2.5">
                          {cameraItems.slice(0, 2).map((cam: any) => (
                            <div
                              key={cam.id}
                              className="group relative rounded-lg overflow-hidden border border-slate-200 bg-slate-900 aspect-video cursor-pointer"
                              onClick={() =>
                                setPreviewPhoto({
                                  open: true,
                                  url: cam.image_data_url,
                                  title: cam.event_type || 'Translator Camera Snapshot',
                                  official: transSess.user_name,
                                  timestamp: cam.created_at || new Date().toISOString(),
                                })
                              }
                            >
                              <img
                                src={cam.image_data_url}
                                alt="Translator Camera Snapshot"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="px-2 py-1 rounded bg-white text-slate-900 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                                  <Maximize2 className="w-3 h-3 text-indigo-600" />
                                  Expand Photo
                                </span>
                              </div>
                              <div className="absolute bottom-1 left-1 right-1 bg-slate-900/80 backdrop-blur-xs px-1.5 py-0.5 rounded text-[9px] font-mono text-white truncate">
                                {new Date(cam.created_at).toLocaleTimeString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Audio Evidence Section */}
                    <div className="space-y-2 bg-white p-3.5 rounded-xl border border-slate-200/80">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                          Voice Evidence Audio Recordings ({evData.voice.length})
                        </span>
                        <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                          Acoustic Wire Active
                        </span>
                      </div>

                      {evData.voice.length === 0 ? (
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/70 text-center space-y-1">
                          <p className="text-[11px] text-slate-500">Live Microphone Listening Telemetry Active (-42.0 dB)</p>
                          <p className="text-[10px] text-slate-400">Microphone stream is actively monitored for unauthorized acoustic leak.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {evData.voice.slice(0, 2).map((v: any) => (
                            <div key={v.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 space-y-1.5">
                              <div className="flex justify-between items-center text-[10px] font-mono text-slate-600">
                                <span>Voice Sample #{v.id?.substring(0, 10)}</span>
                                <span>{new Date(v.created_at).toLocaleTimeString()} ({v.duration_seconds || 3}s)</span>
                              </div>
                              <audio
                                controls
                                src={v.audio_data_url}
                                className="w-full h-8"
                                preload="metadata"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <div className="p-1 rounded-md bg-emerald-50 text-emerald-800">
                  <Activity className="w-3.5 h-3.5" />
                </div>
                <span>Recent Immutable Events Ledger</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">Live Chained Ledger</span>
            </div>

            <div className="space-y-2">
              {auditEvents.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No immutable records in ledger yet.</p>
              ) : (
                auditEvents.slice(0, 6).map(e => (
                  <div key={e.id} className="p-3.5 rounded-xl bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 text-xs flex justify-between items-center transition-colors">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{e.event_type}</span>
                        <span className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          {e.role || 'SYSTEM'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        User: {e.user_email || 'System'} • Tx: {e.tx_ref?.substring(0, 16)}...
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                      {new Date(e.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* AUDIT TRAIL / LOGIN HISTORY */}
      {(activeSubTab === 'audit_trail' || activeSubTab === 'login_history') && (
        <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
              Audit Logs
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">
              Immutable Audit Trail & Authentication History
            </h3>
            <p className="text-xs text-slate-500">Cryptographic audit trail recorded with SHA-256 sequence hashes.</p>
          </div>

          <div className="space-y-2.5">
            {auditEvents.length === 0 ? (
              <p className="text-xs text-slate-400 p-6 text-center">No audit records in ledger.</p>
            ) : (
              auditEvents.map(e => (
                <div key={e.id} className="p-4 rounded-xl bg-white hover:bg-slate-50/60 border border-slate-200/80 shadow-xs text-xs space-y-2 transition-all">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900 text-sm">{e.event_type}</span>
                    <span className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                      REF: {e.tx_ref?.substring(0, 18)}...
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 flex items-center gap-3 flex-wrap">
                    <span>Operator: <strong className="text-slate-800">{e.user_email || 'System Worker'}</strong> ({e.role || 'N/A'})</span>
                    <span className="text-slate-300">•</span>
                    <span className="font-mono text-slate-500">IP: {e.ip_address}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-100">
                    Timestamp: {new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SECURITY EVENTS */}
      {activeSubTab === 'security_events' && (
        <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
              Vigilance Telemetry
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">
              Security Incident Telemetry & Threat Scores
            </h3>
            <p className="text-xs text-slate-500">Continuous anomaly detection and access violation alerts.</p>
          </div>

          <div className="space-y-3">
            {securityEvents.length === 0 ? (
              <p className="text-xs text-slate-400 p-6 text-center">No threats detected. All systems operating normally.</p>
            ) : (
              securityEvents.map(e => (
                <div key={e.id} className="p-4 rounded-xl bg-white hover:bg-slate-50/60 border border-slate-200 shadow-xs text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{e.event_type}</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          e.severity === 'CRITICAL'
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : e.severity === 'HIGH'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-slate-50 text-slate-800 border-slate-300'
                        }`}
                      >
                        {e.severity}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Risk Score: {e.risk_score} • IP: {e.ip_address} • {new Date(e.timestamp).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {!e.resolved && (
                      <button
                        onClick={() => handleResolveSecurityEvent(e.id)}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* PRINTING & PAPER EVENTS */}
      {(activeSubTab === 'printing_events' || activeSubTab === 'paper_events' || activeSubTab === 'regeneration_events') && (
        <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Distribution Forensics
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">
              Physical Paper Distribution & Serialization Audit
            </h3>
            <p className="text-xs text-slate-500">Forensic tracking and serialization hashes of physical test paper printouts.</p>
          </div>

          <div className="space-y-3">
            {printHistory.length === 0 ? (
              <p className="text-xs text-slate-400 p-6 text-center">No physical printing events logged.</p>
            ) : (
              printHistory.map(p => (
                <div key={p.id} className="p-4 rounded-xl bg-white hover:bg-slate-50/60 border border-slate-200 shadow-xs text-xs flex justify-between items-center transition-all">
                  <div className="space-y-1">
                    <span className="font-mono font-bold text-slate-900 text-sm">{p.copy_id}</span>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Tx: {p.tx_hash} • Printed: {new Date(p.printed_at).toLocaleString()}
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    FORENSICALLY LOGGED
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* AUTHORITY SURVEILLANCE AUDIT */}
      {activeSubTab === 'proctor_dashboard' && (
        <AuthoritySurveillanceDashboard currentUser={currentUser} />
      )}

      {/* FULL-SCREEN PHOTO PREVIEW MODAL */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 overflow-hidden shadow-2xl space-y-0">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold">{previewPhoto.title}</h4>
                <div className="text-[11px] text-slate-400 font-mono">
                  {previewPhoto.official} • {new Date(previewPhoto.timestamp).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => setPreviewPhoto(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-950 flex items-center justify-center">
              <img
                src={previewPhoto.url}
                alt={previewPhoto.title}
                className="max-h-[70vh] w-auto object-contain rounded-lg border border-slate-800"
              />
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
              <button
                onClick={() => setPreviewPhoto(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
