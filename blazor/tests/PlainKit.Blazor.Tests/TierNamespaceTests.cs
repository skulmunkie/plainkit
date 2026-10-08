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
        Assert.Equal("PlainKit.Blazor.Components", typeof(PkCardMenu).Namespace); // generated from pk-card-menu since #728; was hand-written in the root namespace
        Assert.Equal("PlainKit.Blazor.Pages", typeof(PkWizardPage).Namespace);
        Assert.Equal("PlainKit.Blazor.Shells", typeof(PkAppShell).Namespace);
    }

    // #768 part (b): the hand-written components live in the namespace of their element's tier too (the generator refuses a mismatch).
    [Fact]
    public void Hand_written_components_live_in_the_namespace_of_their_tier()
    {
        foreach (var t in new[] { typeof(PkAppBarSearch), typeof(PkDock), typeof(PkPageHeader), typeof(PkDataTable<>) })
            Assert.Equal("PlainKit.Blazor.Components", t.Namespace);
        foreach (var t in new[] { typeof(PkSettingsPage), typeof(PkToolPage), typeof(PkListPage<>) })
            Assert.Equal("PlainKit.Blazor.Pages", t.Namespace);
    }

    [Fact]
    public void Hand_written_elements_and_Blazor_only_helpers_stay_in_the_root_namespace()
    {
        foreach (var t in new[] { typeof(PkTable<>), typeof(PkSideNav), typeof(PkGallery), typeof(PkRecordForm), typeof(PkElementBase), typeof(PageBase) })
            Assert.Equal("PlainKit.Blazor", t.Namespace);
    }

    [Fact]
    public void The_old_names_of_the_non_generic_hand_written_components_still_resolve()
    {
        // The generated aliases (PkGeneratedAliases.cs) name them: this file has no using for the tier namespaces beyond the project's global ones.
        Assert.Equal(typeof(PlainKit.Blazor.Components.PkDock), typeof(PkDock));
        Assert.Equal(typeof(PlainKit.Blazor.Pages.PkToolPage), typeof(PkToolPage));
    }

    [Fact]
    public void The_dev_tools_still_find_a_component_in_its_tier_namespace()
    {
        foreach (var (tag, name) in new[] { ("pk-tabs", "PkTabs"), ("pk-dock", "PkDock"), ("pk-settings-page", "PkSettingsPage"), ("pk-app-shell", "PkAppShell"), ("pk-button", "PkButton") })
        {
            var info = PkMappingInfo.Describe(tag);
            Assert.NotNull(info);
            Assert.Equal(name, info.Component);
        }
    }

    [Fact]
    public void Base_elements_stay_in_the_root_namespace()
    {
        Assert.Equal("PlainKit.Blazor", typeof(PkButton).Namespace);
        Assert.Equal("PlainKit.Blazor", typeof(PkCard).Namespace);
    }
}