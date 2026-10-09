import React, { useState } from 'react';
import {
  Upload,
  FileUp,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Layers,
  ShieldCheck,
  Download,
  Plus,
} from 'lucide-react';
import { SubjectRule, UploadedSubjectPdf } from './CompetitiveBlueprintForm';
import { api } from '../../api';

interface UploadedFileRecord {
  file?: File;
  id?: string;
  fileId?: string;
  name: string;
  size: number;
  subject: string;
  subjectId?: string;
  status: 'PENDING' | 'UPLOADING' | 'PROCESSING' | 'EXTRACTED' | 'COMPLETED' | 'FAILED' | 'ERROR';
  extractedCount?: number;
  errorMessage?: string;
  poolId?: string;
  uploadedAt?: string;
}

interface SubjectUploaderProps {
  examId: string;
  subjects: SubjectRule[];
  onBack?: () => void;
  onProceed?: () => void;
  onExtractionFinished?: () => void;
  onUpdateSubjects?: (subjects: SubjectRule[]) => void;
}

export const CompetitiveSubjectUploader: React.FC<SubjectUploaderProps> = ({
  examId,
  subjects,
  onBack,
  onProceed,
  onExtractionFinished,
  onUpdateSubjects,
}) => {
  const [subjectFiles, setSubjectFiles] = useState<Record<string, UploadedFileRecord[]>>(() => {
    const initial: Record<string, UploadedFileRecord[]> = {};
    subjects.forEach(s => {
      initial[s.subjectName || s.id] = (s.pdfs || []).map(p => ({
        id: p.id || p.fileId,
        fileId: p.fileId || p.id,
        name: p.name,
        size: p.size,
        subject: s.subjectName,
        subjectId: s.id,
        status: (p.status === 'COMPLETED' ? 'EXTRACTED' : p.status) as any,
        extractedCount: p.extractedCount || 0,
        uploadedAt: p.uploadedAt || new Date().toISOString(),
      }));
    });
    return initial;
  });

  const [isExtractingGlobal, setIsExtractingGlobal] = useState(false);
  const [activeDeletingId, setActiveDeletingId] = useState<string | null>(null);

  // Format file size
  const formatSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Handle files selected for a subject
  const handleFilesSelected = async (subjectRule: SubjectRule, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const sKey = subjectRule.subjectName || subjectRule.id;

    const newRecords: UploadedFileRecord[] = Array.from(files).map(file => ({
      file,
      name: file.name,
      size: file.size,
      subject: subjectRule.subjectName,
      subjectId: subjectRule.id,
      status: 'UPLOADING',
      uploadedAt: new Date().toISOString(),
    }));

    setSubjectFiles(prev => ({
      ...prev,
      [sKey]: [...(prev[sKey] || []), ...newRecords],
    }));

    // Auto extract each uploaded file immediately
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await extractSingleFile(subjectRule, file);
    }
  };

  // Trigger extraction for a single file into PostgreSQL BYTEA
  const extractSingleFile = async (
    subjectRule: SubjectRule,
    file: File
  ) => {
    const sKey = subjectRule.subjectName || subjectRule.id;

    // Update status to PROCESSING
    setSubjectFiles(prev => {
      const current = [...(prev[sKey] || [])];
      const idx = current.findIndex(f => f.name === file.name);
      if (idx !== -1) {
        current[idx] = { ...current[idx], status: 'PROCESSING', errorMessage: undefined };
      }
      return { ...prev, [sKey]: current };
    });

    try {
      const base64Data = await fileToBase64(file);

      const resp = await api.competitive.uploadSubjectPdf({
        exam_id: examId,
        subject_id: subjectRule.id,
        subject_name: subjectRule.subjectName,
        subject: subjectRule.subjectName,
        file_name: file.name,
        file_data: base64Data,
        marks_per_question: subjectRule.marksPerQuestion,
        negative_marks: subjectRule.negativeMarks,
      });

      if (resp && resp.success) {
        const extractedCount = resp.extractedCount || resp.questions?.length || 0;
        const fileId = resp.fileId || `cpf-${Date.now()}`;

        setSubjectFiles(prev => {
          const current = [...(prev[sKey] || [])];
          const idx = current.findIndex(f => f.name === file.name);
          if (idx !== -1) {
            current[idx] = {
              ...current[idx],
              id: fileId,
              fileId,
              status: 'EXTRACTED',
              extractedCount,
              poolId: resp.poolId || fileId,
              uploadedAt: new Date().toISOString(),
            };
          }
          return { ...prev, [sKey]: current };
        });

        if (onUpdateSubjects) {
          const updated = subjects.map(s => {
            if (s.id !== subjectRule.id) return s;
            const currentPdfs = [...(s.pdfs || [])];
            const pdfIdx = currentPdfs.findIndex(p => p.name === file.name || p.id === fileId);
            const newPdf: UploadedSubjectPdf = {
              id: fileId,
              fileId,
              name: file.name,
              size: file.size,
              status: 'COMPLETED',
              extractedCount,
              poolId: fileId,
              subjectId: s.id,
              uploadedAt: new Date().toISOString(),
            };
            if (pdfIdx !== -1) currentPdfs[pdfIdx] = newPdf;
            else currentPdfs.push(newPdf);
            return { ...s, pdfs: currentPdfs };
          });
          onUpdateSubjects(updated);
        }

        if (onExtractionFinished) onExtractionFinished();
      } else {
        throw new Error((resp as any)?.error || 'Extraction returned no questions.');
      }
    } catch (err: any) {
      setSubjectFiles(prev => {
        const current = [...(prev[sKey] || [])];
        const idx = current.findIndex(f => f.name === file.name);
        if (idx !== -1) {
          current[idx] = {
            ...current[idx],
            status: 'FAILED',
            errorMessage: err.message || 'Failed to extract questions from PDF.',
          };
        }
        return { ...prev, [sKey]: current };
      });
    }
  };

  // Remove / Delete a file from subject pool
  const handleDeleteFile = async (subjectRule: SubjectRule, record: UploadedFileRecord, index: number) => {
    const sKey = subjectRule.subjectName || subjectRule.id;
    const fileId = record.fileId || record.id;
    setActiveDeletingId(fileId || record.name);

    try {
      await api.competitive.deletePoolFile({
        exam_id: examId,
        subject_id: subjectRule.id,
        subject: subjectRule.subjectName,
        source_pdf: record.name,
        file_id: fileId,
      });

      setSubjectFiles(prev => {
        const current = [...(prev[sKey] || [])];
        current.splice(index, 1);
        return { ...prev, [sKey]: current };
      });

      if (onUpdateSubjects) {
        const updated = subjects.map(s => {
          if (s.id !== subjectRule.id) return s;
          const currentPdfs = (s.pdfs || []).filter(p => p.name !== record.name && p.id !== fileId && p.fileId !== fileId);
          return { ...s, pdfs: currentPdfs };
        });
        onUpdateSubjects(updated);
      }
    } catch (err: any) {
      alert(`Failed to delete pool file: ${err.message || err}`);
    } finally {
      setActiveDeletingId(null);
    }
  };

  // Calculate overall stats
  let totalFilesUploaded = 0;
  let totalExtractedQuestions = 0;

  subjects.forEach(s => {
    const list = subjectFiles[s.subjectName || s.id] || [];
    totalFilesUploaded += list.length;
    list.forEach(f => {
      totalExtractedQuestions += f.extractedCount || 0;
    });
  });

  return (
    <div className="space-y-6">
      {/* Top Advisory Banner */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 text-xs shadow-xs space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <span>Step 3: Subject-Wise Question Pools & Multiple PDF Uploads</span>
        </div>
        <p className="text-slate-600 leading-relaxed max-w-3xl">
          Question pools are strictly organized by <strong>Subject</strong>. You can upload <strong>multiple PDFs per subject</strong> (1, 2, 3, or more).
          All PDF binaries are stored directly in <strong>PostgreSQL BYTEA</strong> (never Cloudinary). Questions are extracted automatically with LaTeX math, formulas, and diagram references preserved.
        </p>
      </div>

      {/* Global Metrics Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-slate-200 text-xs shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-slate-100 font-mono font-bold text-slate-800 border border-slate-200">
            {totalFilesUploaded} Source PDF{totalFilesUploaded !== 1 ? 's' : ''} Attached
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 font-mono font-bold border border-emerald-200">
            {totalExtractedQuestions} Real Questions In Pools
          </div>
          <span className="text-slate-500 text-[11px]">
            Stored in PostgreSQL binary tables with strict organization isolation.
          </span>
        </div>
      </div>

      {/* Subject-Wise Upload Cards (Requirements 5 & 6) */}
      <div className="space-y-6">
        {subjects.map((subjectRule, sIdx) => {
          const sKey = subjectRule.subjectName || subjectRule.id;
          const files = subjectFiles[sKey] || [];
          const extractedForSubject = files.reduce((acc, f) => acc + (f.extractedCount || 0), 0);
          const requiredCount = Number(subjectRule.numberOfQuestions) || 0;
          const isReady = extractedForSubject >= requiredCount && requiredCount > 0;

          return (
            <div
              key={subjectRule.id || sIdx}
              className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4"
            >
              {/* Subject Pool Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 border border-slate-200">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono uppercase bg-slate-100 text-slate-700">
                        Subject #{subjectRule.subjectOrder || sIdx + 1}
                      </span>
                      <h3 className="text-base font-bold text-slate-900">
                        {subjectRule.subjectName || `<Subject ${sIdx + 1}>`} Question Pool
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Required by Blueprint: <strong>{requiredCount} Questions</strong> ({subjectRule.questionType} • {subjectRule.marksPerQuestion} Marks/Q • {subjectRule.negativeMarks ? `-${subjectRule.negativeMarks} Negative` : 'No Negative'})
                    </p>
                  </div>
                </div>

                {/* Pool Status Badge (INCOMPLETE / READY) */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                      isReady
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-amber-50 text-amber-800 border-amber-300'
                    }`}
                  >
                    {isReady ? '✓ READY' : '⏳ INCOMPLETE'}
                  </span>
                  <span className="text-xs text-slate-600 font-mono font-bold">
                    {extractedForSubject} / {requiredCount} Extracted
                  </span>
                </div>
              </div>

              {/* Upload Dropzone & Action */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-xs">
                <div className="space-y-0.5">
                  <p className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Upload className="w-4 h-4 text-slate-600" />
                    <span>Upload PDF Papers for {subjectRule.subjectName || 'this subject'}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Supports 1, 2, 3, or more question PDFs. Each PDF contributes questions into this subject pool.
                  </p>
                </div>

                <div>
                  <input
                    type="file"
                    accept=".pdf"
                    multiple
                    id={`uploader-sub-${subjectRule.id}`}
                    className="hidden"
                    onChange={e => {
                      handleFilesSelected(subjectRule, e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <label
                    htmlFor={`uploader-sub-${subjectRule.id}`}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Upload PDF(s)</span>
                  </label>
                </div>
              </div>

              {/* List of Uploaded PDFs for this Subject */}
              {files.length === 0 ? (
                <div className="p-6 rounded-xl border border-slate-100 bg-white text-center text-xs text-slate-500 space-y-1">
                  <p className="font-bold text-slate-700">No PDFs uploaded yet for {subjectRule.subjectName || 'this subject'}.</p>
                  <p className="text-[11px]">Upload source examination papers above to populate this subject's question pool.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white text-xs">
                  {files.map((fileRec, fIdx) => {
                    const isDeleting = activeDeletingId === (fileRec.fileId || fileRec.name);

                    return (
                      <div
                        key={fileRec.id || fIdx}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="w-5 h-5 text-slate-600 shrink-0" />
                          <div className="min-w-0 space-y-0.5">
                            <p className="font-bold text-slate-900 truncate">{fileRec.name}</p>
                            <p className="text-[11px] text-slate-500 font-mono flex items-center gap-2">
                              <span>Size: {formatSize(fileRec.size)}</span>
                              <span>•</span>
                              <span>Uploaded: {new Date(fileRec.uploadedAt || Date.now()).toLocaleTimeString()}</span>
                              <span>•</span>
                              <span>Subject: {subjectRule.subjectName}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
                          {/* Status Badge */}
                          {(fileRec.status === 'EXTRACTED' || fileRec.status === 'COMPLETED') && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>{fileRec.extractedCount || 0} Questions Extracted</span>
                            </span>
                          )}

                          {fileRec.status === 'PROCESSING' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1 animate-pulse">
                              <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
                              <span>Processing...</span>
                            </span>
                          )}

                          {fileRec.status === 'UPLOADING' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                              Uploading...
                            </span>
                          )}

                          {(fileRec.status === 'FAILED' || fileRec.status === 'ERROR') && (
                            <span
                              className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200"
                              title={fileRec.errorMessage}
                            >
                              Failed
                            </span>
                          )}

                          {/* Download Link if fileId exists */}
                          {fileRec.fileId && (
                            <a
                              href={`/api/competitive/pool-files/${encodeURIComponent(fileRec.fileId)}/download`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                              title="Download PDF Binary"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          )}

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteFile(subjectRule, fileRec, fIdx)}
                            disabled={isDeleting}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                            title={`Delete ${fileRec.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Navigation Footer */}
      {(onBack || onProceed) && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs flex items-center gap-2 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Blueprint</span>
            </button>
          ) : <div />}

          {onProceed && (
            <button
              type="button"
              onClick={onProceed}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              <span>Proceed to Step 4: Question Verification</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
