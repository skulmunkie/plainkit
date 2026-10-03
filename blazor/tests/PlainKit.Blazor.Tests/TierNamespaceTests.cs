using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

// #768: generated components of the component, page and shell tiers live in PlainKit.Blazor.Components / .Pages / .Shells; base elements stay in PlainKit.Blazor.
// The generated global using aliases (PkGeneratedAliases.cs, linked into this project) keep C# on the old names compiling for one minor version.
public sealed class TierNamespaceTests
{
    [Fact]
    public void Old_C_sharp_names_resolve_to_the_tier_namespaces()
    {
        Assert.Equal("PlainKit.Blazor.Components", typeof(PkTabs).Namespace);
        Assert.Equal("PlainKit.Blazor.Components", typeof(PkKanban).Namespace);
        Assert.Equal("PlainKit.Blazor.Pages", typeof(PkWizardPage).Namespace);
        Assert.Equal("PlainKit.Blazor.Shells", typeof(PkAppShell).Namespace);
    }

    [Fact]
    public void Base_elements_stay_in_the_root_namespace()
    {
        Assert.Equal("PlainKit.Blazor", typeof(PkButton).Namespace);
        Assert.Equal("PlainKit.Blazor", typeof(PkCard).Namespace);
    }
}