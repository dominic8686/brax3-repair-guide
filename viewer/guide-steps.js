// State is derived from completed steps, so direct links and backwards navigation agree.
export function stateBefore(step, steps) {
  return Object.assign({}, ...steps.slice(0, step - 1).map(item => item.stage.after));
}
