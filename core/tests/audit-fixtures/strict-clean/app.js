// Shaped like core/samples/app: pk-* elements only, no CSS/class/style/raw-tag duplication - the audit CLI
// should report zero findings against this fixture, even with --strict.
document.getElementById('about').addEventListener('close', () => {});
