namespace PlainKit.Blazor.Testing;

public static partial class PkPageTesting
{
    /// <summary>Resumes a save the way a host does after its own confirm (what <c>SaveAsync(skipBeforeSave: true)</c> does on the page): the same checks, edits, <c>Save</c> and <c>OnSave</c> as <see cref="SaveAsync{TItem}"/>, but <c>BeforeSave</c> does not run again. Named apart from <c>SaveAsync</c> because the page's own <c>SaveAsync(bool)</c> would win the overload and call the element instead of this test path.</summary>
    public static Task<string?> ResumeSaveAsync<TItem>(this Pages.PkRecordPage<TItem> page) => (page ?? throw new ArgumentNullException(nameof(page))).SaveForTestAsync(skipBeforeSave: true);
}
