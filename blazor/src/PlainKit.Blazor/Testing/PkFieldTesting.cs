using System.Runtime.CompilerServices;
using Microsoft.Extensions.DependencyInjection;
using PlainKit.Blazor.Testing;

namespace PlainKit.Blazor.Components
{
    internal interface IPkFieldGroupSeam
    {
        IReadOnlyList<PkFieldState> Shown();
        Task<string?> CommitAsync(string key, object? value);
    }

    public partial class PkFieldGroup<TItem> : IPkFieldGroupSeam   // every group registers with its runtime (one per test context or circuit), so the helpers need no TItem
    {
        IReadOnlyList<PkFieldState> IPkFieldGroupSeam.Shown() => FieldsForTest();
        Task<string?> IPkFieldGroupSeam.CommitAsync(string key, object? value) => CommitForTestAsync(key, value);
        protected override void OnInitialized() => PkFieldTesting.Track(Runtime, this);
        private void Untrack() => PkFieldTesting.Untrack(Runtime, this);
    }
}

namespace PlainKit.Blazor.Testing
{
    /// <summary>
    /// Page-wide field seams: they span every <see cref="Components.PkFieldGroup{TItem}"/> rendered in the context without naming the item type (which may be private or nested).
    /// Call them on the context's service provider: <c>Services.FieldStates()</c> (also <c>cut.Services</c>). Groups are listed in the order they were created, which is document order for a page.
    /// </summary>
    public static class PkFieldTesting
    {
        private static readonly ConditionalWeakTable<PkRuntime, List<Components.IPkFieldGroupSeam>> Tracked = new();

        internal static void Track(PkRuntime runtime, Components.IPkFieldGroupSeam group) { var l = Tracked.GetOrCreateValue(runtime); lock (l) l.Add(group); }

        internal static void Untrack(PkRuntime runtime, Components.IPkFieldGroupSeam group) { if (Tracked.TryGetValue(runtime, out var l)) lock (l) l.Remove(group); }

        private static Components.IPkFieldGroupSeam[] Groups(IServiceProvider services)
        {
            ArgumentNullException.ThrowIfNull(services);
            var l = Tracked.GetOrCreateValue(services.GetRequiredService<PkRuntime>());
            lock (l) return [.. l];
        }

        /// <summary>Every shown field of every field group, in document order (a field whose <c>When</c> is false is absent).</summary>
        public static IReadOnlyList<PkFieldState> FieldStates(this IServiceProvider services) => Groups(services).SelectMany(g => g.Shown()).ToList();

        /// <summary>The first shown field with this key in any group, or null when none shows it.</summary>
        public static PkFieldState? FieldState(this IServiceProvider services, string key) => services.FieldStates().FirstOrDefault(f => f.Key == key);

        /// <summary>Commits this key on the first group that shows it, as <see cref="PkFieldGroupTesting.CommitAsync{TItem}"/> does; returns its field error, else null. Throws when no group shows the key.</summary>
        public static Task<string?> CommitFieldAsync(this IServiceProvider services, string key, object? value) =>
            (Groups(services).FirstOrDefault(g => g.Shown().Any(f => f.Key == key)) ?? throw new InvalidOperationException($"No field group shows a field '{key}'.")).CommitAsync(key, value);
    }
}
