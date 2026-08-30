export { scoreJob, jobLabel, type JobFitInput } from "./job";
export { scoreScholarship, type ScholarshipFitInput, type ScholarshipVerdict } from "./scholarship";
export { scoreTaskPriority, priorityTier, type PriorityInput, type PriorityResult, type TaskStatus, type TaskSource } from "./priority";
export { scoreLead, type LeadScoreInput } from "./lead";
export { matchRequirement, extractRequirementTerms, type RequirementMatch, type RequirementStrength } from "./match";
export { buildProfileIndex, proficiencyToLevel, type ProfileIndex } from "./profile-index";
export { weightedScore, buildExplanation, type Factor, type ScoreResult, type EvidencePointer } from "./types";
