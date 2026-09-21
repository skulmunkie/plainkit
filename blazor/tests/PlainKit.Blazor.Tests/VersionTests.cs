using Bunit;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor;

namespace PlainKit.Blazor.Tests;

/// <summary>The SDK and PlainKit.Blazor share one version (core/VERSION); every place it is stamped must agree.</summary>
public sealed class VersionTests
{
    private static string RepoRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "core", "VERSION"))) return dir.FullName;
        throw new InvalidOperationException("core/VERSION not found above the test output folder");
    }

    private static string CoreVersion() => File.ReadAllText(Path.Combine(RepoRoot(), "core", "VERSION")).Trim();

    [Fact]
    public void The_package_version_is_core_VERSION()
    {
        Assert.Equal(CoreVersion(), PkAssets.Version);
    }

    [Fact]
    public void The_copy_of_dist_the_package_serves_is_stamped_with_the_same_version()
    {
        var stamp = File.ReadAllText(Path.Combine(RepoRoot(), "blazor", "src", "PlainKit.Blazor", "wwwroot", "plainkit", "js", "version.js"));
        Assert.Contains($"PK_VERSION = '{CoreVersion()}'", stamp);
    }

    [Fact]
    public async Task The_runtime_reports_the_version_of_the_javascript_it_loaded()
    {
        using var ctx = new TestContext();
        ctx.Services.AddPlainKit();
        var module = ctx.JSInterop.SetupModule("./_content/PlainKit.Blazor/plainkit.blazor.js");
        module.Setup<string>("version").SetResult("9.9.9");

        Assert.Equal("9.9.9", await ctx.Services.GetRequiredService<PkRuntime>().GetSdkVersionAsync());
    }
}
