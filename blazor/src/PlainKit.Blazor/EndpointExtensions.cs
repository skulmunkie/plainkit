using Microsoft.AspNetCore.Builder;

namespace PlainKit.Blazor;

/// <summary>Endpoint registration for PlainKit.Blazor.</summary>
public static class EndpointExtensions
{
    /// <summary>
    /// Makes the dev tools page (<c>/_plainkit</c>) routable in a Blazor Web App: chain it after <c>MapRazorComponents</c>. The router in
    /// <c>Routes.razor</c> also needs <c>AdditionalAssemblies="new[] { typeof(PlainKit.Blazor.PkAssets).Assembly }"</c>.
    /// </summary>
    public static RazorComponentsEndpointConventionBuilder AddPlainKitDevTools(this RazorComponentsEndpointConventionBuilder builder) =>
        builder.AddAdditionalAssemblies(typeof(PkAssets).Assembly);
}
