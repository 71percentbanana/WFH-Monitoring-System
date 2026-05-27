with open("tracker.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
in_loop = False

for line in lines:
    if line.startswith("last_activity = None"):
        new_lines.append("def start_tracking():\n")
        new_lines.append("    global last_input_time\n")
        new_lines.append("    " + line)
        in_loop = True
    elif in_loop:
        if line.strip() == "":
            new_lines.append(line)
        else:
            new_lines.append("    " + line)
    else:
        new_lines.append(line)

with open("tracker.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
