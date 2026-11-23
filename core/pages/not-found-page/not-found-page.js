// pk-not-found-page: a preset of pk-states-page (#1929; meta "extends" pk-states-page, "fixed" state empty): the build layers this class over the states page's
// behaviour, which draws the empty state through the shared js/page-states.js markup. This layer adds the default text (the states page reads `$fb` when a prop is
// empty) and an optional `label` action: a real pk-button in pk-empty-state's own actions slot that raises pk-action instead of navigating itself - the host decides
// what "Go home" means (STANDARDS.md: elements talk back through events, never callback props).
export default Base => class extends Base {
    $fb = { heading: 'Page not found', description: "The page you're looking for doesn't exist or you don't have access to it." };
    updated() {
        super.updated();
        const drawn = this.$s.firstElementChild;
        if (this.label && drawn) {
            const btn = this.ownerDocument.createElement('pk-button');
            btn.slot = 'actions';
            btn.textContent = this.label;
            btn.addEventListener('click', () => this.emit('pk-action', null, { cancelable: false }));
            drawn.append(btn);
        }
    }
};
