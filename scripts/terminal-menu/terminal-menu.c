/*
 * 🦅 NoC Raven - Terminal Menu Interface
 * Interactive terminal-based management interface
 * 
 * Copyright (c) 2024 Rectitude 369, LLC
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <time.h>
#include <sys/wait.h>
#include <ncurses.h>

#define VERSION "1.0.0-alpha"
#define MAX_MENU_ITEMS 20
#define MAX_CMD_LEN 256
#define MAX_OUTPUT_LINES 100

/* Menu structure */
typedef struct {
    char *title;
    char *description;
    char *command;
    int enabled;
} MenuItem;

/* Global variables */
static int current_selection = 0;
static int menu_count = 0;
static MenuItem menu_items[MAX_MENU_ITEMS];
static char output_buffer[MAX_OUTPUT_LINES][256];
static int output_lines = 0;

/* Color pairs */
#define COLOR_TITLE 1
#define COLOR_MENU_SELECTED 2
#define COLOR_MENU_NORMAL 3
#define COLOR_STATUS 4
#define COLOR_ERROR 5
#define COLOR_SUCCESS 6

/* Function prototypes */
void init_ncurses(void);
void cleanup_ncurses(void);
void init_menu(void);
void draw_header(void);
void draw_menu(void);
void draw_footer(void);
void draw_status_bar(const char *status);
void handle_input(int ch);
void execute_command(const char *command);
void show_help(void);
void show_system_info(void);
void signal_handler(int sig);
void add_output_line(const char *line);
void clear_output(void);

/* Signal handler for cleanup */
void signal_handler(int sig) {
    cleanup_ncurses();
    exit(0);
}

/* Initialize ncurses */
void init_ncurses(void) {
    initscr();
    cbreak();
    noecho();
    keypad(stdscr, TRUE);
    curs_set(0);
    
    /* Initialize colors */
    if (has_colors()) {
        start_color();
        init_pair(COLOR_TITLE, COLOR_CYAN, COLOR_BLACK);
        init_pair(COLOR_MENU_SELECTED, COLOR_BLACK, COLOR_WHITE);
        init_pair(COLOR_MENU_NORMAL, COLOR_WHITE, COLOR_BLACK);
        init_pair(COLOR_STATUS, COLOR_GREEN, COLOR_BLACK);
        init_pair(COLOR_ERROR, COLOR_RED, COLOR_BLACK);
        init_pair(COLOR_SUCCESS, COLOR_GREEN, COLOR_BLACK);
    }
    
    /* Set up signal handlers */
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
}

/* Cleanup ncurses */
void cleanup_ncurses(void) {
    endwin();
}

/* Initialize menu items */
void init_menu(void) {
    menu_count = 0;
    
    /* System Status */
    menu_items[menu_count++] = (MenuItem){
        "System Status", 
        "View system health and service status",
        "/opt/noc-raven/bin/health-check.sh",
        1
    };
    
    /* Network Tools */
    menu_items[menu_count++] = (MenuItem){
        "Network Interface Status",
        "Show network interface information",
        "/opt/noc-raven/bin/network-tools.sh interface-status",
        1
    };
    
    menu_items[menu_count++] = (MenuItem){
        "Port Scan",
        "Check telemetry port availability",
        "/opt/noc-raven/bin/network-tools.sh port-scan",
        1
    };
    
    menu_items[menu_count++] = (MenuItem){
        "Test NetFlow Reception",
        "Monitor NetFlow traffic for 10 seconds",
        "/opt/noc-raven/bin/network-tools.sh flow-test",
        1
    };
    
    menu_items[menu_count++] = (MenuItem){
        "Test Syslog Reception",
        "Monitor Syslog traffic for 10 seconds",
        "/opt/noc-raven/bin/network-tools.sh syslog-test",
        1
    };
    
    /* Service Management */
    menu_items[menu_count++] = (MenuItem){
        "Service Status",
        "Show status of all NoC Raven services",
        "supervisorctl status",
        1
    };
    
    menu_items[menu_count++] = (MenuItem){
        "Restart All Services",
        "Restart all telemetry collection services",
        "supervisorctl restart all",
        1
    };
    
    menu_items[menu_count++] = (MenuItem){
        "Start Web Interface",
        "Start the web management interface",
        "systemctl start nginx",
        1
    };
    
    menu_items[menu_count++] = (MenuItem){
        "Stop Web Interface",
        "Stop the web management interface",
        "systemctl stop nginx",
        1
    };
    
    /* Logs and Monitoring */
    menu_items[menu_count++] = (MenuItem){
        "View Recent Logs",
        "Show recent system and service logs",
        "tail -50 /var/log/noc-raven/*.log",
        1
    };
    
    menu_items[menu_count++] = (MenuItem){
        "Show System Resources",
        "Display CPU, memory, and disk usage",
        "free -h && df -h && uptime",
        1
    };
    
    menu_items[menu_count++] = (MenuItem){
        "Show Process List",
        "List running NoC Raven processes",
        "ps aux | grep -E '(goflow2|fluent-bit|vector|telegraf|nginx)'",
        1
    };
    
    /* Configuration */
    menu_items[menu_count++] = (MenuItem){
        "Edit GoFlow2 Config",
        "Edit NetFlow collector configuration",
        "nano /opt/noc-raven/config/goflow2.yml",
        1
    };
    
    menu_items[menu_count++] = (MenuItem){
        "Edit Vector Config",
        "Edit data pipeline configuration",
        "nano /etc/vector/vector.toml",
        1
    };
    
    /* Utilities */
    menu_items[menu_count++] = (MenuItem){
        "Boot Manager",
        "Run system initialization sequence",
        "/opt/noc-raven/bin/boot-manager.sh",
        1
    };
    
    menu_items[menu_count++] = (MenuItem){
        "System Information",
        "Show detailed system information",
        "",  /* Special case - handled in code */
        1
    };
    
    menu_items[menu_count++] = (MenuItem){
        "Help",
        "Show help and documentation",
        "",  /* Special case - handled in code */
        1
    };
    
    menu_items[menu_count++] = (MenuItem){
        "Exit",
        "Exit NoC Raven terminal menu",
        "",  /* Special case - handled in code */
        1
    };
}

/* Draw header */
void draw_header(void) {
    int max_y, max_x;
    getmaxyx(stdscr, max_y, max_x);
    
    attron(COLOR_PAIR(COLOR_TITLE) | A_BOLD);
    mvprintw(0, (max_x - 50) / 2, "🦅 NoC Raven - Terminal Management Interface");
    mvprintw(1, (max_x - 20) / 2, "Version %s", VERSION);
    attroff(COLOR_PAIR(COLOR_TITLE) | A_BOLD);
    
    /* Draw separator line */
    mvhline(2, 0, ACS_HLINE, max_x);
}

/* Draw menu */
void draw_menu(void) {
    int max_y, max_x;
    getmaxyx(stdscr, max_y, max_x);
    int start_y = 4;
    int menu_width = max_x - 4;
    
    for (int i = 0; i < menu_count; i++) {
        if (start_y + i >= max_y - 3) break; /* Leave space for footer */
        
        if (i == current_selection) {
            attron(COLOR_PAIR(COLOR_MENU_SELECTED) | A_BOLD);
            mvprintw(start_y + i, 2, "► %-*s", menu_width - 4, menu_items[i].title);
            attroff(COLOR_PAIR(COLOR_MENU_SELECTED) | A_BOLD);
        } else {
            attron(COLOR_PAIR(COLOR_MENU_NORMAL));
            mvprintw(start_y + i, 2, "  %-*s", menu_width - 4, menu_items[i].title);
            attroff(COLOR_PAIR(COLOR_MENU_NORMAL));
        }
    }
    
    /* Show description of selected item */
    if (current_selection < menu_count) {
        int desc_y = start_y + menu_count + 2;
        if (desc_y < max_y - 2) {
            attron(COLOR_PAIR(COLOR_STATUS));
            mvprintw(desc_y, 2, "Description: %s", menu_items[current_selection].description);
            attroff(COLOR_PAIR(COLOR_STATUS));
        }
    }
}

/* Draw footer */
void draw_footer(void) {
    int max_y, max_x;
    getmaxyx(stdscr, max_y, max_x);
    
    /* Draw separator line */
    mvhline(max_y - 3, 0, ACS_HLINE, max_x);
    
    attron(COLOR_PAIR(COLOR_STATUS));
    mvprintw(max_y - 2, 2, "↑/↓: Navigate  Enter: Execute  H: Help  Q: Quit");
    attroff(COLOR_PAIR(COLOR_STATUS));
}

/* Draw status bar */
void draw_status_bar(const char *status) {
    int max_y, max_x;
    getmaxyx(stdscr, max_y, max_x);
    
    attron(COLOR_PAIR(COLOR_SUCCESS));
    mvprintw(max_y - 1, 2, "Status: %s", status);
    clrtoeol();
    attroff(COLOR_PAIR(COLOR_SUCCESS));
    refresh();
}

/* Add line to output buffer */
void add_output_line(const char *line) {
    if (output_lines < MAX_OUTPUT_LINES - 1) {
        strncpy(output_buffer[output_lines], line, 255);
        output_buffer[output_lines][255] = '\0';
        output_lines++;
    }
}

/* Clear output buffer */
void clear_output(void) {
    output_lines = 0;
}

/* Execute command */
void execute_command(const char *command) {
    if (strlen(command) == 0) return;
    
    clear();
    printw("Executing: %s\n\n", command);
    refresh();
    
    /* Temporarily exit ncurses mode */
    def_prog_mode();
    endwin();
    
    /* Execute command */
    int result = system(command);
    
    /* Return to ncurses mode */
    reset_prog_mode();
    refresh();
    
    printw("\n\nCommand completed with exit code: %d\n", WEXITSTATUS(result));
    printw("Press any key to continue...");
    refresh();
    getch();
}

/* Show system information */
void show_system_info(void) {
    clear();
    printw("🦅 NoC Raven - System Information\n");
    printw("=====================================\n\n");
    
    /* Get system information */
    FILE *fp;
    char buffer[256];
    
    /* Hostname */
    fp = popen("hostname", "r");
    if (fp) {
        if (fgets(buffer, sizeof(buffer), fp)) {
            printw("Hostname: %s", buffer);
        }
        pclose(fp);
    }
    
    /* Uptime */
    fp = popen("uptime", "r");
    if (fp) {
        if (fgets(buffer, sizeof(buffer), fp)) {
            printw("Uptime: %s", buffer);
        }
        pclose(fp);
    }
    
    /* Memory */
    fp = popen("free -h | head -2", "r");
    if (fp) {
        printw("\nMemory Information:\n");
        while (fgets(buffer, sizeof(buffer), fp)) {
            printw("%s", buffer);
        }
        pclose(fp);
    }
    
    /* Disk space */
    fp = popen("df -h | grep -E '(Filesystem|/dev/|tmpfs)' | head -5", "r");
    if (fp) {
        printw("\nDisk Information:\n");
        while (fgets(buffer, sizeof(buffer), fp)) {
            printw("%s", buffer);
        }
        pclose(fp);
    }
    
    /* Network interfaces */
    fp = popen("ip -br addr show", "r");
    if (fp) {
        printw("\nNetwork Interfaces:\n");
        while (fgets(buffer, sizeof(buffer), fp)) {
            printw("%s", buffer);
        }
        pclose(fp);
    }
    
    printw("\n\nPress any key to continue...");
    refresh();
    getch();
}

/* Show help */
void show_help(void) {
    clear();
    printw("🦅 NoC Raven - Terminal Menu Help\n");
    printw("==================================\n\n");
    printw("Navigation:\n");
    printw("  ↑/↓ or k/j    - Move up/down in menu\n");
    printw("  Enter/Space   - Execute selected command\n");
    printw("  h or ?        - Show this help screen\n");
    printw("  q or Q        - Quit the menu\n");
    printw("  Ctrl+C        - Emergency exit\n\n");
    
    printw("Menu Categories:\n");
    printw("  System Status - Health checks and system monitoring\n");
    printw("  Network Tools - Network diagnostics and testing\n");
    printw("  Service Mgmt  - Start/stop/restart system services\n");
    printw("  Logs & Monitor- View logs and system resources\n");
    printw("  Configuration - Edit configuration files\n");
    printw("  Utilities     - System tools and information\n\n");
    
    printw("NoC Raven Services:\n");
    printw("  GoFlow2       - NetFlow/IPFIX collector (port 2055/UDP)\n");
    printw("  Fluent Bit    - Syslog processor (port 514/UDP)\n");
    printw("  Vector        - Data pipeline (port 8084/TCP)\n");
    printw("  Telegraf      - Metrics collector\n");
    printw("  Nginx         - Web interface (port 8080/TCP)\n\n");
    
    printw("Web Interface:\n");
    printw("  Access the web management interface at:\n");
    printw("  http://localhost:8080 (or your container IP)\n\n");
    
    printw("Support:\n");
    printw("  Documentation: /opt/noc-raven/docs/\n");
    printw("  Logs: /var/log/noc-raven/\n");
    printw("  Config: /opt/noc-raven/config/\n\n");
    
    printw("Press any key to continue...");
    refresh();
    getch();
}

/* Handle input */
void handle_input(int ch) {
    switch (ch) {
        case KEY_UP:
        case 'k':
            current_selection = (current_selection - 1 + menu_count) % menu_count;
            break;
            
        case KEY_DOWN:
        case 'j':
            current_selection = (current_selection + 1) % menu_count;
            break;
            
        case '\n':
        case '\r':
        case ' ':
            /* Handle special cases */
            if (strcmp(menu_items[current_selection].title, "Help") == 0) {
                show_help();
            } else if (strcmp(menu_items[current_selection].title, "System Information") == 0) {
                show_system_info();
            } else if (strcmp(menu_items[current_selection].title, "Exit") == 0) {
                cleanup_ncurses();
                exit(0);
            } else if (strlen(menu_items[current_selection].command) > 0) {
                execute_command(menu_items[current_selection].command);
            }
            break;
            
        case 'h':
        case '?':
            show_help();
            break;
            
        case 'q':
        case 'Q':
            cleanup_ncurses();
            exit(0);
            break;
    }
}

/* Main function */
int main(int argc, char *argv[]) {
    /* Check if we're in a terminal */
    if (!isatty(STDIN_FILENO)) {
        fprintf(stderr, "This program requires a terminal interface.\n");
        return 1;
    }
    
    /* Initialize */
    init_ncurses();
    init_menu();
    
    /* Main loop */
    int ch;
    while (1) {
        clear();
        draw_header();
        draw_menu();
        draw_footer();
        draw_status_bar("Ready - Select an option and press Enter");
        
        ch = getch();
        handle_input(ch);
    }
    
    cleanup_ncurses();
    return 0;
}
