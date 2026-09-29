// Hand-rolled modal wiring, kept deliberately naive: this fixture exists to prove the audit CLI finds D
// duplication (a real app would compose pk-dialog/pk-tabs instead - see core/tests/audit-fixtures/strict-clean/
// for what that looks like).
const modal = document.querySelector('.modal');
modal.role = 'dialog';
