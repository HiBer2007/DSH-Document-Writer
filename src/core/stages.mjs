export const STAGES = [
  { id: 'S0', name: '受理', gate: 'soft', requires: [], skill: 'docwrite-intake' },
  { id: 'S1', name: '约束', gate: 'hard', requires: ['S0'], skill: 'docwrite-constraints' },
  { id: 'S2', name: '规格', gate: 'hard', requires: ['S1'], skill: 'docwrite-spec' },
  { id: 'S3', name: '素材', gate: 'soft', requires: ['S1'], skill: 'docwrite-source' },
  { id: 'S4', name: '提纲', gate: 'soft', requires: ['S2'], skill: 'docwrite-outline' },
  { id: 'S5', name: '初稿', gate: 'soft', requires: ['S4'], skill: 'docwrite-draft' },
  { id: 'S6', name: '内容评审', gate: 'hard', requires: ['S5'], skill: 'docwrite-review-content', review: true },
  { id: 'S7', name: '降重', gate: 'soft', requires: ['S6'], skill: 'docwrite-reduce', review: true },
  { id: 'S8', name: '成型', gate: 'hard', requires: ['S7'], skill: 'docwrite-compose' },
  { id: 'S9', name: '形式评审', gate: 'hard', requires: ['S8'], skill: 'docwrite-review-form', review: true },
  { id: 'S10', name: '终检', gate: 'hard', requires: ['S9'], skill: 'docwrite-verify', review: true },
  { id: 'S11', name: '交付', gate: 'hard', requires: ['S10'], skill: 'docwrite-deliver' },
]

export const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.id, s]))
export const STAGE_IDS = STAGES.map((s) => s.id)

export function stageIndex(id) {
  return STAGE_IDS.indexOf(id)
}

/** 允许的回退边 */
export const GUARDS = {
  S6: ['S4', 'S5'],
  S9: ['S5', 'S8'],
  S10: ['S5', 'S7', 'S8'],
}

/** 进入该阶段前必须完成的用户确认点 */
export const ENTRY_APPROVAL = {
  S1: 'U0',
  S2: 'U1',
  S3: 'U2',
  S4: 'U2',
  S5: 'U3',
  S7: 'U5',
  S8: 'U6',
  S11: 'U7',
}

/** 评审阶段完成时需要的确认点 */
export const REVIEW_APPROVAL = 'U4'

export const REVIEW_STAGES = STAGES.filter((s) => s.review).map((s) => s.id)

/** 作用域入口 */
export const SCOPE_ENTRY = {
  full: 'S0',
  scan: 'S7',
  reduce: 'S7',
  revise: 'S5',
  compose: 'S8',
  verify: 'S10',
}

/** 每阶段必须产物（相对项目目录） */
export const ARTIFACTS = {
  S0: ['brief.md'],
  S1: ['constraints.json'],
  S2: ['spec.md'],
  S3: ['sources/index.json'],
  S4: ['outline.md'],
  S5: ['draft.md'],
  S6: ['review-content.json'],
  S7: ['draft_reduced.md', 'reduce-report.json', 'human-review.json'],
  S8: ['build'],
  S9: ['review-form.json'],
  S10: ['verify-report.md'],
  S11: ['deliver'],
}

export const DEFAULTS = {
  maxLoopsPerEdge: 3,
  maxTotalRevisions: 8,
  maxRoundsPerReview: 3,
  maxReviewExtraRounds: 2,
  minDiffCheckpoints: 3,
  maxChangedRatioPerCheckpoint: 0.3,
  requireApprovals: true,
  modificationRateMin: 0.4,
  aiRateMax: 0.35,
  aiFlavorMax: 0.3,
  machineFlavorMax: 0.3,
}
