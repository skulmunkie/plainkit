export default Base => class extends Base {
    connected() { this.aria({ role: 'status' }); }
};
