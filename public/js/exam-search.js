const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function filterExams(exams, query='', kind='') {
  const needle=normalize(query.trim());
  return exams.filter(exam=>(!kind || exam.kind===kind) && normalize(exam.label).includes(needle));
}
