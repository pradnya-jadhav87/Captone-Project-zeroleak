import mongoose, { Model } from 'mongoose';

export * from './common.ts';
export * from './User.ts';
export * from './Organization.ts';
export * from './AicteUniversity.ts';
export * from './AuthorizedRepresentative.ts';
export * from './AuthorizedUser.ts';
export * from './TrustedDevice.ts';
export * from './DeviceChallenge.ts';
export * from './DeviceReplacementRequest.ts';
export * from './DeviceEvent.ts';
export * from './SystemSetting.ts';
export * from './Notification.ts';
export * from './AuditEvent.ts';
export * from './SecurityEvent.ts';
export * from './CompetitiveExam.ts';
export * from './CompetitiveQuestionPoolFile.ts';
export * from './CompetitiveQuestionPool.ts';
export * from './CompetitiveQuestion.ts';
export * from './CompetitiveGeneratedPaper.ts';
export * from './CompetitivePaperAuditLog.ts';
export * from './Examination.ts';
export * from './ExaminationConfiguration.ts';
export * from './ExaminationCentre.ts';
export * from './Question.ts';
export * from './QuestionPaper.ts';
export * from './DraftPaper.ts';
export * from './DraftQuestion.ts';
export * from './QuestionPaperPage.ts';
export * from './QuestionVerification.ts';
export * from './QuestionAssignment.ts';
export * from './QuestionTranslation.ts';
export * from './QuestionQuarantine.ts';
export * from './PaperBlueprint.ts';
export * from './GeneratedPaper.ts';
export * from './GeneratedPaperQuestion.ts';
export * from './CandidatePaperAssignment.ts';
export * from './UniversityGeneratedPaper.ts';
export * from './UniversityPaperAuditLog.ts';
export * from './VariantLifecycleEvent.ts';
export * from './EncryptedPaper.ts';
export * from './KeyShare.ts';
export * from './PaperVersion.ts';
export * from './PaperQuestion.ts';
export * from './PaperValidationResult.ts';
export * from './PaperReleaseEvent.ts';
export * from './PrintCopy.ts';
export * from './PrintAnywhereJob.ts';
export * from './RegenerationEvent.ts';
export * from './ExamAttempt.ts';
export * from './ProctorSession.ts';
export * from './AuthorityProctorSession.ts';
export * from './ProctorEvent.ts';
export * from './ProctorSetting.ts';
export * from './ProctorVoiceEvidence.ts';
export * from './ProctorCameraEvidence.ts';
export * from './ExamSimulationSession.ts';
export * from './ViewOncePreviewSession.ts';
export * from './DeletedVaultAsset.ts';
export * from './OrganizationDocument.ts';
export * from './TranslationTask.ts';
export * from './EmergencyIncident.ts';
export * from './EmergencyPaper.ts';
export * from './SecurityKeyAttempt.ts';
export * from './SecurityAuthorization.ts';

import { UserModel } from './User.ts';
import { OrganizationModel } from './Organization.ts';
import { AicteUniversityModel } from './AicteUniversity.ts';
import { AuthorizedRepresentativeModel } from './AuthorizedRepresentative.ts';
import { AuthorizedUserModel } from './AuthorizedUser.ts';
import { TrustedDeviceModel } from './TrustedDevice.ts';
import { DeviceChallengeModel } from './DeviceChallenge.ts';
import { DeviceReplacementRequestModel } from './DeviceReplacementRequest.ts';
import { DeviceEventModel } from './DeviceEvent.ts';
import { SystemSettingModel } from './SystemSetting.ts';
import { NotificationModel } from './Notification.ts';
import { AuditEventModel } from './AuditEvent.ts';
import { SecurityEventModel } from './SecurityEvent.ts';
import { CompetitiveExamModel } from './CompetitiveExam.ts';
import { CompetitiveQuestionPoolFileModel } from './CompetitiveQuestionPoolFile.ts';
import { CompetitiveQuestionPoolModel } from './CompetitiveQuestionPool.ts';
import { CompetitiveQuestionModel } from './CompetitiveQuestion.ts';
import { CompetitiveGeneratedPaperModel } from './CompetitiveGeneratedPaper.ts';
import { CompetitivePaperAuditLogModel } from './CompetitivePaperAuditLog.ts';
import { ExaminationModel } from './Examination.ts';
import { ExaminationConfigurationModel } from './ExaminationConfiguration.ts';
import { ExaminationCentreModel } from './ExaminationCentre.ts';
import { QuestionModel } from './Question.ts';
import { QuestionPaperModel } from './QuestionPaper.ts';
import { DraftPaperModel } from './DraftPaper.ts';
import { DraftQuestionModel } from './DraftQuestion.ts';
import { QuestionPaperPageModel } from './QuestionPaperPage.ts';
import { QuestionVerificationModel } from './QuestionVerification.ts';
import { QuestionAssignmentModel } from './QuestionAssignment.ts';
import { QuestionTranslationModel } from './QuestionTranslation.ts';
import { QuestionQuarantineModel } from './QuestionQuarantine.ts';
import { PaperBlueprintModel } from './PaperBlueprint.ts';
import { GeneratedPaperModel } from './GeneratedPaper.ts';
import { GeneratedPaperQuestionModel } from './GeneratedPaperQuestion.ts';
import { CandidatePaperAssignmentModel } from './CandidatePaperAssignment.ts';
import { UniversityGeneratedPaperModel } from './UniversityGeneratedPaper.ts';
import { UniversityPaperAuditLogModel } from './UniversityPaperAuditLog.ts';
import { VariantLifecycleEventModel } from './VariantLifecycleEvent.ts';
import { EncryptedPaperModel } from './EncryptedPaper.ts';
import { KeyShareModel } from './KeyShare.ts';
import { PaperVersionModel } from './PaperVersion.ts';
import { PaperQuestionModel } from './PaperQuestion.ts';
import { PaperValidationResultModel } from './PaperValidationResult.ts';
import { PaperReleaseEventModel } from './PaperReleaseEvent.ts';
import { PrintCopyModel } from './PrintCopy.ts';
import { PrintAnywhereJobModel } from './PrintAnywhereJob.ts';
import { RegenerationEventModel } from './RegenerationEvent.ts';
import { ExamAttemptModel } from './ExamAttempt.ts';
import { ProctorSessionModel } from './ProctorSession.ts';
import { AuthorityProctorSessionModel } from './AuthorityProctorSession.ts';
import { ProctorEventModel } from './ProctorEvent.ts';
import { ProctorSettingModel } from './ProctorSetting.ts';
import { ProctorVoiceEvidenceModel } from './ProctorVoiceEvidence.ts';
import { ProctorCameraEvidenceModel } from './ProctorCameraEvidence.ts';
import { ExamSimulationSessionModel } from './ExamSimulationSession.ts';
import { ViewOncePreviewSessionModel } from './ViewOncePreviewSession.ts';
import { DeletedVaultAssetModel } from './DeletedVaultAsset.ts';
import { OrganizationDocumentModel } from './OrganizationDocument.ts';
import { OrganizationVerificationModel } from './OrganizationVerification.ts';
import { TranslationTaskModel } from './TranslationTask.ts';
import { EmergencyIncidentModel } from './EmergencyIncident.ts';
import { EmergencyPaperModel } from './EmergencyPaper.ts';
import { SecurityKeyAttemptModel } from './SecurityKeyAttempt.ts';
import { SecurityAuthorizationModel } from './SecurityAuthorization.ts';

export const TableToModelMap: Record<string, Model<any>> = {
  users: UserModel,
  organizations: OrganizationModel,
  aicte_universities: AicteUniversityModel,
  authorized_representatives: AuthorizedRepresentativeModel,
  authorized_users: AuthorizedUserModel,
  trusted_devices: TrustedDeviceModel,
  device_challenges: DeviceChallengeModel,
  device_replacement_requests: DeviceReplacementRequestModel,
  device_events: DeviceEventModel,
  system_settings: SystemSettingModel,
  notifications: NotificationModel,
  audit_events: AuditEventModel,
  security_events: SecurityEventModel,
  competitive_exams: CompetitiveExamModel,
  competitive_question_pool_files: CompetitiveQuestionPoolFileModel,
  competitive_question_pools: CompetitiveQuestionPoolModel,
  competitive_questions: CompetitiveQuestionModel,
  competitive_generated_papers: CompetitiveGeneratedPaperModel,
  competitive_paper_audit_logs: CompetitivePaperAuditLogModel,
  examinations: ExaminationModel,
  examination_configurations: ExaminationConfigurationModel,
  examination_centres: ExaminationCentreModel,
  questions: QuestionModel,
  question_papers: QuestionPaperModel,
  draft_papers: DraftPaperModel,
  draft_questions: DraftQuestionModel,
  question_paper_pages: QuestionPaperPageModel,
  question_verifications: QuestionVerificationModel,
  question_assignments: QuestionAssignmentModel,
  question_translations: QuestionTranslationModel,
  question_quarantine: QuestionQuarantineModel,
  paper_blueprints: PaperBlueprintModel,
  generated_papers: GeneratedPaperModel,
  generated_paper_questions: GeneratedPaperQuestionModel,
  candidate_paper_assignments: CandidatePaperAssignmentModel,
  university_generated_papers: UniversityGeneratedPaperModel,
  university_paper_audit_logs: UniversityPaperAuditLogModel,
  variant_lifecycle_events: VariantLifecycleEventModel,
  encrypted_papers: EncryptedPaperModel,
  key_shares: KeyShareModel,
  paper_versions: PaperVersionModel,
  paper_questions: PaperQuestionModel,
  paper_validation_results: PaperValidationResultModel,
  paper_release_events: PaperReleaseEventModel,
  print_copies: PrintCopyModel,
  print_anywhere_jobs: PrintAnywhereJobModel,
  regeneration_events: RegenerationEventModel,
  exam_attempts: ExamAttemptModel,
  proctor_sessions: ProctorSessionModel,
  authority_proctor_sessions: AuthorityProctorSessionModel,
  proctor_events: ProctorEventModel,
  proctor_settings: ProctorSettingModel,
  proctor_voice_evidence: ProctorVoiceEvidenceModel,
  proctor_camera_evidence: ProctorCameraEvidenceModel,
  exam_simulation_sessions: ExamSimulationSessionModel,
  view_once_preview_sessions: ViewOncePreviewSessionModel,
  deleted_vault_assets: DeletedVaultAssetModel,
  organization_documents: OrganizationDocumentModel,
  organization_verifications: OrganizationVerificationModel,
  translation_tasks: TranslationTaskModel,
  emergency_incidents: EmergencyIncidentModel,
  emergency_papers: EmergencyPaperModel,
  security_key_attempts: SecurityKeyAttemptModel,
  security_authorizations: SecurityAuthorizationModel,
};

