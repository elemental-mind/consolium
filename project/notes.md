# Control Sequence Introducer (CSI)

CSI stands for Control Sequence Introducer. `ESC` followed by `[` is interpreted as a control sequence beginning, followed by a sequence of parameter bytes and then a final command character specifying the command.

Sequences use the layout below. Numerical parameters are expressed as concatenated ASCII digit bytes. For example, the number `15` is expressed as the ASCII character byte for `1`, followed by the ASCII character byte for `5`. Multiple parameters can be present and are separated by `;`.

```text
CSI layout:       ESC                [                <priv marker/Namesp.>    <parameters>    <intermediates>    <command letter>

> Optionality:    required           required         optional                 optional        optional           required
> Range:          literal: \x1b      literal: [       one of: <=>?             0x30-3f*        0x20-2f*           0x40-7e
```

Example: `ESC [ < 35;35;5 M` is an SGR mouse event; `<` is not numeric.

It can be read as: "In namespace `<`, execute function `M(35, 35, 5)`."

For further understanding, see this [light introduction to ANSI escape codes](https://notes.burke.libbey.me/ansi-escape-codes/).
