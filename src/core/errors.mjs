export const EXIT = {
  OK: 0,
  USAGE: 1,
  CHECK: 2,
  PREREQ: 3,
  IO: 4,
  BUDGET: 5,
  APPROVAL: 6,
}

export class CliError extends Error {
  constructor(message, code = EXIT.USAGE) {
    super(message)
    this.name = 'CliError'
    this.code = code
  }
}
