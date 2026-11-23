using System.Text.RegularExpressions;

namespace PlainKit.Blazor;

// The outline rules, the same as the toolkit's core/modules/code-explorer/symbols.js (keep them in step): top-level JS/TS declarations, CSS class
// rules, C# types with their methods, properties and constants (depth 1), and Razor directives, @code members and component tags.
public sealed partial class PkSnapshot
{
    private const string Mod = @"(?:(?:public|internal|private|protected|static|virtual|override|abstract|async|sealed|partial|readonly|extern|new|unsafe)\s+)";
    private const string Attr = @"(?:\[[^\]]*\]\s*)*";
    private const string Plain = @"(?:\s{4}|\t)(?!(?:return|await|else|throw|yield|using|new|var|if|while|for|foreach|switch|lock|case|goto)\b)";
    private const string Ty = @"[\w<>.?,\[\]]+";
    private static readonly Regex CsTypeRx = new($@"^\s*{Mod}*(class|record|interface|enum|struct)\s+([A-Za-z_]\w*)");
    private static readonly Regex CsConstRx = new($@"^\s+{Attr}{Mod}*const\s+{Ty}\s+([A-Za-z_]\w*)\s*=");
    private static readonly Regex CsMethodRx = new($@"^(?:\s+{Attr}{Mod}+|{Plain}{Attr}){Ty}\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(");
    private static readonly Regex CsPropRx = new($@"^(?:\s+{Attr}{Mod}+|{Plain}{Attr}){Ty}\s+([A-Za-z_]\w*)\s*(?:\{{\s*(?:get|set|init)|=>)");
    private static readonly Regex RazorDirectiveRx = new(@"^@(page|inject|inherits|implements|using)\s+(?:\S+\s+(\w+)|(\S+))");
    private static readonly Regex RazorTagRx = new(@"<([A-Z]\w*)[\s/>]");

    internal static List<PkSnapshotSymbol> SymbolsOf(string content, string language)
    {
        var symbols = new List<PkSnapshotSymbol>();
        var lines = content.Split('\n');
        var seen = new HashSet<string>();
        var inCode = false;
        void Add(string kind, string name, int line, int depth) => symbols.Add(new PkSnapshotSymbol { Kind = kind, Name = name, Line = line, Depth = depth });
        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i];
            Match m;
            switch (language)
            {
                case "js" or "ts" or "tsx" or "jsx":
                    if ((m = JsDeclaration().Match(line)).Success) Add(m.Groups[3].Value, m.Groups[4].Value, i + 1, 0);
                    break;
                case "css":
                    if ((m = CssRule().Match(line)).Success) Add("rule", m.Groups[1].Value, i + 1, 0);
                    break;
                case "cs":
                    if (CsSymbol(line) is { } cs) Add(cs.Kind, cs.Name, i + 1, cs.Depth);
                    break;
                case "razor":
                    if (Regex.IsMatch(line, @"^@(code|functions)\s*\{")) { inCode = true; Add("code", "@code", i + 1, 0); }
                    else if (inCode) { if (CsSymbol(line) is { } cm) Add(cm.Kind, cm.Name, i + 1, 1); }
                    else if ((m = RazorDirectiveRx.Match(line)).Success) Add(m.Groups[1].Value, m.Groups[2].Success ? m.Groups[2].Value : m.Groups[3].Value, i + 1, 0);
                    else foreach (Match t in RazorTagRx.Matches(line)) if (seen.Add(t.Groups[1].Value)) Add("component", t.Groups[1].Value, i + 1, 0);
                    break;
            }
        }
        return symbols;
    }

    private static (string Kind, string Name, int Depth)? CsSymbol(string line)
    {
        var m = CsTypeRx.Match(line);
        if (m.Success) return (m.Groups[1].Value, m.Groups[2].Value, 0);
        if ((m = CsConstRx.Match(line)).Success) return ("const", m.Groups[1].Value, 1);
        if ((m = CsMethodRx.Match(line)).Success) return ("method", m.Groups[1].Value, 1);
        if ((m = CsPropRx.Match(line)).Success) return ("property", m.Groups[1].Value, 1);
        return null;
    }

    [GeneratedRegex(@"^(export )?(async )?(function|class|const)\s+([A-Za-z_$][\w$]*)")]
    private static partial Regex JsDeclaration();

    [GeneratedRegex(@"^(\.[\w-]+)[^{]*\{")]
    private static partial Regex CssRule();
}
