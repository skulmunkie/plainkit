export default Base => class extends Base {
    updated() { this.aria({ role: this.inline ? null : 'paragraph' }); }
};
