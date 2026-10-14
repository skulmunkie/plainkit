using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;

namespace PlainKit.Blazor;

/// <summary>The app's error boundary (#364): a module's page that throws shows an error state with a Try again button, and the rest of the frame stays alive.</summary>
public sealed class PkModuleBoundary : ErrorBoundary
{
    protected override void OnInitialized() => ErrorContent = _ => b =>
    {
        b.OpenElement(0, "pk-alert");
        b.AddAttribute(1, "variant", "danger");
        b.AddAttribute(2, "heading", "Something went wrong");
        b.AddContent(3, "This page failed to load.");
        b.OpenElement(4, "pk-button");
        b.AddAttribute(5, "slot", "actions");
        b.AddAttribute(6, "onpk-click", EventCallback.Factory.Create(this, Recover));
        b.AddContent(7, "Try again");
        b.CloseElement();
        b.CloseElement();
    };
}
